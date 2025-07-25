import torch, os, shutil, importlib, sys
from huggingface_hub import scan_cache_dir, repo_exists, repo_info, snapshot_download
from huggingface_hub.errors import CacheNotFound
from loguru import logger
from transformers import pipeline
from custom_infer.base import CustomModel

class ModelManager:
    def __init__(self, logger):
        self.loaded_models = {}
        self.cached_models = set()
        self.custom_infer = {}
        self.logger = logger

    def scan_cache(self):
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

    def load_model(self, model_name):
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

    def download_model(self, model_name):
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

    def unload_model(self, model_name):
        if model_name in self.loaded_models:
            del self.loaded_models[model_name]
            torch.cuda.empty_cache()
            self.logger.info(f"Model {model_name} unloaded successfully.")
        else:
            self.logger.warning(f"Model {model_name} is not loaded.")

    def delete_model(self, model_name):
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

    def get_pipeline(self, model_name):
        if (model_name not in self.loaded_models and model_name in self.cached_models):
            self.load_model(model_name)
        return self.loaded_models.get(model_name)
    
    def load_custom_infer(self, model_name):
        filename = model_name.replace("/", "__") + ".py"
        module_path = os.path.join("custom_infer", filename)

        if not os.path.isfile(module_path):
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
    
    def create_custom_model(self, model_name, code):
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
        
    def is_custom_model(self, model_name):
        return model_name in self.custom_infer

