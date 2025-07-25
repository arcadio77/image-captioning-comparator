import torch, os, shutil
from huggingface_hub import scan_cache_dir, repo_exists, repo_info, snapshot_download
from huggingface_hub.errors import CacheNotFound
from loguru import logger
from transformers import pipeline

class ModelManager:
    def __init__(self, logger):
        self.loaded_models = {}
        self.cached_models = set()
        self.logger = logger

    async def scan_cache(self):
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

    async def load_model(self, model_name):
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

    async def download_model(self, model_name):
        if model_name in self.cached_models:
            self.logger.warning(f"Model {model_name} is already cached.")
            return

        try:
            await self.load_model(model_name)

            self.cached_models.add(model_name)
            self.logger.info(f"Model {model_name} downloaded and loaded successfully.")
        except Exception as e:
            self.logger.error(f"Failed to download model {model_name}: {e}")
            await self.delete_model(model_name)
            raise e

    async def unload_model(self, model_name):
        if model_name in self.loaded_models:
            del self.loaded_models[model_name]
            torch.cuda.empty_cache()
            self.logger.info(f"Model {model_name} unloaded successfully.")
        else:
            self.logger.warning(f"Model {model_name} is not loaded.")

    async def delete_model(self, model_name):
        await self.unload_model(model_name)
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

    async def get_pipeline(self, model_name):
        if model_name not in self.loaded_models and model_name in self.cached_models:
            await self.load_model(model_name)
        return self.loaded_models.get(model_name) 

