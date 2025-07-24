from huggingface_hub import repo_exists, repo_info

def is_valid_model(model_name):
    try:
        return repo_exists(model_name) and ("image-to-text" in repo_info(model_name).tags or "image-text-to-text" in repo_info(model_name).tags)
    except Exception as e:
        return False