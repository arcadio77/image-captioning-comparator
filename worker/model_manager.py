import torch, os, shutil, importlib, sys
from huggingface_hub import scan_cache_dir, repo_exists, repo_info, snapshot_download
from huggingface_hub.errors import CacheNotFound
from loguru import logger
from transformers import pipeline
from custom_infer.base import CustomModel
from typing import Union, Callable, Any, Optional

class ModelManager:
    """
    Manages machine learning models from Hugging Face Hub including
    caching, loading, downloading, unloading, deleting, and support for
    custom inference implementations.
    """
    def __init__(self, logger):
        """
        Initializes ModelManager instance.

        Args:
            logger: A logger instance for info, warning, and error messages.
        """
        self.loaded_models = {}
        self.cached_models = set()
        self.custom_infer = {}
        self.logger = logger

    def scan_cache(self) -> None:
        """
        Scans local Hugging Face cache directory for models that are
        tagged as "image-to-text" or "image-text-to-text".

        Populates self.cached_models with model IDs found in cache.
        Logs warnings if cache is not found or errors occur.
        """
        try:
            repos = scan_cache_dir().repos
        except CacheNotFound:
            self.logger.warning("Cache not found.")
            return
        
        for repo in repos:
            model = repo.repo_id
            try:
                if repo_exists(model) and any(tag in repo_info(model).tags for tag in ["image-to-text", "image-text-to-text"]):
                    self.cached_models.add(model)
            except Exception as e:
                self.logger.warning(f"Error checking model {model}: {e}")
                continue
        
        self.logger.info(f"Cached models: {self.cached_models}")

    def load_model(self, model_name: str) -> Union[CustomModel, Callable[..., Any]]:
        """
        Loads a model by name.

        1. Tries to load a custom inference implementation if available.
        2. Otherwise, loads a Hugging Face pipeline for "image-to-text"
           or "image-text-to-text" tasks.
        
        Args:
            model_name (str): Model identifier on Hugging Face Hub.
        
        Returns:
            Loaded model instance or custom inference object.

        Raises:
            Exception if the model cannot be loaded or is unsupported.
        """
        custom_infer = self.load_custom_infer(model_name)
        if custom_infer is not None:
            self.logger.info(f"Using custom inference for model {model_name}.")
            custom_infer.load()
            self.custom_infer[model_name] = custom_infer
            self.loaded_models[model_name] = custom_infer
            return custom_infer

        try:
            tags = repo_info(model_name).tags
            if "image-text-to-text" in tags:
                pipe = pipeline("image-text-to-text", model=model_name, trust_remote_code=True, device_map="auto", torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32)
            elif "image-to-text" in tags:
                pipe = pipeline("image-to-text", model=model_name, trust_remote_code=True, device_map="auto", torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32)
            else:
                raise ValueError("Model not supported")
            self.loaded_models[model_name] = pipe

            return pipe
        except Exception as e:
            self.logger.error(f"Failed to load model {model_name}: {e}")
            raise e

    def download_model(self, model_name: str) -> None:
        """
        Downloads a model from Hugging Face Hub if not cached, then loads it.

        Args:
            model_name (str): Model identifier.

        Raises:
            Exception if download or loading fails.
        """
        if model_name in self.cached_models:
            self.logger.warning(f"Model {model_name} is already cached.")
            return

        try:
            self.load_model(model_name)

            self.cached_models.add(model_name)
            self.logger.info(f"Model {model_name} downloaded and loaded successfully.")
        except Exception as e:
            self.logger.error(f"Failed to download model {model_name}: {e}")
            self.delete_model(model_name)
            raise e

    def unload_model(self, model_name) -> None:
        """
        Unloads a loaded model to free resources.

        Args:
            model_name (str): Model identifier.
        """
        if model_name in self.loaded_models:
            del self.loaded_models[model_name]
            torch.cuda.empty_cache()
            self.logger.info(f"Model {model_name} unloaded successfully.")
        else:
            self.logger.warning(f"Model {model_name} is not loaded.")

    def delete_model(self, model_name: str) -> None:
        """
        Deletes cached model files and unloads the model.

        Args:
            model_name (str): Model identifier.
        """
        self.unload_model(model_name)
        try:
            snapshot_path = snapshot_download(model_name, local_files_only=True)
            model_path = os.path.abspath(os.path.join(snapshot_path, "..", ".."))
            shutil.rmtree(model_path)
        except Exception:
            cache_dir = os.getenv("HF_HOME", os.path.expanduser("~/.cache/huggingface"))
            formatted = model_name.replace("/", "--")
            model_cache = os.path.join(cache_dir, "hub", f"models--{formatted}")
            if os.path.exists(model_cache):
                shutil.rmtree(model_cache)

        if model_name in self.cached_models:
            self.cached_models.remove(model_name)
        if model_name in self.loaded_models:
            del self.loaded_models[model_name]
        
        self.logger.info(f"Model {model_name} deleted successfully.")

    def get_pipeline(self, model_name: str) -> Union[CustomModel, Callable[..., Any], None]:
        """
        Returns the loaded model or pipeline instance.

        If the model is cached but not loaded, attempts to load it.

        Args:
            model_name (str): Model identifier.

        Returns:
            Loaded model or pipeline instance, or None if not found.
        """
        if (model_name not in self.loaded_models and model_name in self.cached_models):
            self.load_model(model_name)
        return self.loaded_models.get(model_name)
    
    def load_custom_infer(self, model_name: str) -> Union[CustomModel, None]:
        """
        Loads a custom inference module for a model if available.

        Looks for a Python file in 'custom_infer/' named after the model
        (with '/' replaced by '__') and imports it.

        Args:
            model_name (str): Model identifier.

        Returns:
            Instance of a subclass of CustomModel if found and loaded, else None.
        """
        filename = model_name.replace("/", "__") + ".py"
        module_path = os.path.join("custom_infer", filename)

        if not os.path.exists(module_path) or not os.path.isfile(module_path):
            self.logger.info(f"Current working directory: {os.getcwd()}")
            self.logger.warning(f"Custom infer file not found: {module_path}")
            return None
        
        spec = importlib.util.spec_from_file_location(model_name, module_path)
        module = importlib.util.module_from_spec(spec)
        sys.modules[filename] = module
        try:
            spec.loader.exec_module(module)
        except Exception as e:
            self.logger.error(f"Failed to import custom inference for {model_name}: {e}")
            return None

        for attr_name in dir(module):
            attr = getattr(module, attr_name)
            try:
                if isinstance(attr, type) and issubclass(attr, CustomModel) and attr is not CustomModel:
                    instance = attr()
                    self.logger.info(f"Custom inference function loaded for model {model_name}.")
                    instance.load()
                    return instance
            except Exception as e:
                self.logger.warning(f"Failed to check class {attr_name} for CustomModel: {e}")

        return None
    
    def create_custom_model(self, model_name: str, code: str):
        """
        Creates and loads a custom inference model from provided source code.

        Writes the source code to a file in 'custom_infer/', then loads it.

        Args:
            model_name (str): Model identifier.
            code (str): Python source code defining the custom model class.

        Raises:
            ValueError if creation or loading fails.
        """
        if model_name in self.custom_infer:
            self.logger.warning(f"Custom model {model_name} already exists.")
            return
        
        filename = model_name.replace("/", "__") + ".py"
        module_path = os.path.join("custom_infer", filename)

        with open(module_path, "w") as f:
            f.write(code)
        
        custom_model = self.load_custom_infer(model_name)
        if custom_model is None:
            raise ValueError(f"Failed to create custom model {model_name}.")
        
        self.custom_infer[model_name] = custom_model
        self.loaded_models[model_name] = custom_model
        self.logger.info(f"Custom model {model_name} created successfully.")
        
    def is_custom_model(self, model_name: str) -> bool:
        """
        Checks if a model is a custom inference model.

        Args:
            model_name (str): Model identifier.

        Returns:
            bool: True if model is custom, False otherwise.
        """
        return model_name in self.custom_infer

