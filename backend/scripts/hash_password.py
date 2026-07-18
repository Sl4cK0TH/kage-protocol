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
    print(f"\nGenerated bcrypt hash:\n{hashed.decode('utf-8')}\n")
    print("Paste this value into your .env as:")
    print(f'ADMIN_PASSWORD_HASH={hashed.decode("utf-8")}')


if __name__ == "__main__":
    main()
