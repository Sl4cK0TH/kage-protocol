#!/usr/bin/env python3
"""
Utility to generate a bcrypt hash for the admin password.

Usage:
    python scripts/hash_password.py <plaintext_password>

Copy the output into your .env file as ADMIN_PASSWORD_HASH.
"""

import sys
import bcrypt


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: python scripts/hash_password.py <plaintext_password>")
        sys.exit(1)

    plaintext = sys.argv[1].encode("utf-8")
    hashed = bcrypt.hashpw(plaintext, bcrypt.gensalt(rounds=12))
    hash_str = hashed.decode("utf-8")
    docker_hash = hash_str.replace("$", "$$")
    print(f"\nGenerated bcrypt hash:\n{hash_str}\n")
    print("For Docker Compose, paste this value into your .env as:")
    print(f"ADMIN_PASSWORD_HASH={docker_hash}")


if __name__ == "__main__":
    main()
