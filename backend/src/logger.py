import logging
import sys
from loguru import logger

def setup_logger():
    logger.remove()
    logger.add(sys.stderr, enqueue=True, backtrace=True, diagnose=True)

    class InterceptHandler(logging.Handler):
        def emit(self, record):
            try:
                level = logger.level(record.levelname).name
            except ValueError:
                level = record.levelno
            logger.opt(depth=6, exception=record.exc_info).log(level, record.getMessage())

    logging.root.handlers = []
    logging.root.setLevel(logging.DEBUG)

    logging.basicConfig(
        level=logging.WARNING,
        handlers=[InterceptHandler()]
    )

    for name in logging.root.manager.loggerDict:
        logging.getLogger(name).handlers = []
        logging.getLogger(name).propagate = True

    return logger

logger = setup_logger()
