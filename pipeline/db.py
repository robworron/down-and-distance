"""Database connection shared by the pipeline scripts."""

import os

from dotenv import load_dotenv
from sqlalchemy import Engine, create_engine


def get_engine() -> Engine:
    """Build a SQLAlchemy engine from DATABASE_URL in .env."""
    load_dotenv()
    url = os.environ["DATABASE_URL"]
    # SQLAlchemy needs the driver named in the URL; Neon and Vercel use plain postgresql://.
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    return create_engine(url)
