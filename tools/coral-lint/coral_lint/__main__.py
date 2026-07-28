"""The only module that touches the real process."""

import sys

from .app import main

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
