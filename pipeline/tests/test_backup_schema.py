"""Unit tests for the schema backup's pure logic: no database or Docker needed."""

import pytest

from pipeline.backup_schema import libpq_env, redact, toc_relations


def test_libpq_env_reaches_local_database_inside_its_container():
    env = libpq_env("postgresql://dnd:p%40ss@localhost:15432/dnd")
    assert env == {"PGHOST": "localhost", "PGPORT": "5432", "PGUSER": "dnd", "PGPASSWORD": "p@ss", "PGDATABASE": "dnd"}


def test_libpq_env_carries_neon_options():
    env = libpq_env("postgresql://owner:secret@ep-x.aws.neon.tech/neondb?sslmode=require&channel_binding=require")
    assert env["PGHOST"] == "ep-x.aws.neon.tech"
    assert env["PGPORT"] == "5432"
    assert env["PGSSLMODE"] == "require"
    assert env["PGCHANNELBINDING"] == "require"


def test_libpq_env_refuses_unknown_options():
    with pytest.raises(ValueError, match="'options'"):
        libpq_env("postgresql://u:p@h/db?options=-csearch_path%3Draw")


def test_redact_hides_host_user_and_password():
    env = {"PGHOST": "ep-x.aws.neon.tech", "PGUSER": "owner", "PGPASSWORD": "secret"}
    message = 'connection to server at "ep-x.aws.neon.tech" failed: password authentication failed for user "owner" (secret)'
    assert redact(message, env) == 'connection to server at "***" failed: password authentication failed for user "***" (***)'


def test_toc_relations_counts_tables_and_views_per_schema():
    toc = """;
; Archive created at 2026-10-21 15:00:00 UTC
6; 2615 16385 SCHEMA - raw owner
220; 1259 16390 TABLE raw schedules owner
221; 1259 16400 TABLE raw pbp owner
222; 1259 16410 VIEW staging stg_games owner
223; 1259 16420 TABLE marts games owner
300; 2606 16500 CONSTRAINT raw schedules schedules_pkey owner
301; 1259 16510 INDEX marts games_idx owner
"""
    assert toc_relations(toc) == {("raw", "TABLE"): 2, ("staging", "VIEW"): 1, ("marts", "TABLE"): 1}
