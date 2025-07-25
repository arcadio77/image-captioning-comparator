from abc import ABC, abstractmethod
from PIL import Image

class CustomModel(ABC):
    @abstractmethod
    def load(self) -> None:
        """Load the custom model."""
        pass

    @abstractmethod
    def infer(self, image: Image) -> str:
        """Run inference on the provided image and return a string caption."""
        pass
