from abc import ABC, abstractmethod
from PIL import Image

class CustomModel(ABC):
    @abstractmethod
    def load(self) -> None:
        """
        Load the custom model.
        This method should handle any model initialization and loading from disk or remote sources.
        """
        pass

    @abstractmethod
    def infer(self, image: Image) -> str:
        """
        Run inference on the provided image and return a caption as a string.
        
        Args:
            image (PIL.Image): The input image to caption.
        
        Returns:
            str: The generated caption for the image.
        """
        pass