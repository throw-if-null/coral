"""Crosscut: the error taxonomy. Checks raise; the root renders.  [ERR-1] [ERR-3]"""

from typing import Literal

Category = Literal[
    "usage", "validation", "not_found", "conflict", "infrastructure", "internal",
]


class CoralError(Exception):
    def __init__(self, category: Category, code: str, message: str) -> None:
        super().__init__(message)
        self.category = category
        self.code = code
        self.message = message


def usage(code: str, message: str) -> CoralError:
    return CoralError("usage", code, message)


def validation(code: str, message: str) -> CoralError:
    return CoralError("validation", code, message)


def infrastructure(code: str, message: str) -> CoralError:
    return CoralError("infrastructure", code, message)
