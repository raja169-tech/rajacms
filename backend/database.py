"""
database.py — Supabase client singleton.

All database and storage access goes through this module.
Uses the service role key so all operations bypass RLS
(authorization is enforced at the FastAPI layer instead).
RLS policies in the schema act as a defense-in-depth backup.
"""
from functools import lru_cache
from supabase import create_client, Client
from config import get_settings


@lru_cache
def get_supabase() -> Client:
    """
    Returns a cached Supabase client using the service role key.
    This client has full database access — never expose it to the frontend.
    """
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_key)
