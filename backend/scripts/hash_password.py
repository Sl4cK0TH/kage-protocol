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
    print(f"\nGenerated bcrypt hash:\n{hash_str}\n")
    # Keep the single quotes: Docker Compose interpolates `$VAR` in env files
    # (which would silently truncate the hash), and python-dotenv would not
    # un-escape a `$$` form. Single-quoted values work for both.
    print("Paste this line into backend/.env (keep the single quotes):")
    print(f"ADMIN_PASSWORD_HASH='{hash_str}'")


if __name__ == "__main__":
    main()
