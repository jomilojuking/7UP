"""Kept for backward compatibility; the logic now lives in insights.py."""

from app.services.insights import study_insights


def suggest(study_name):
    return study_insights(study_name)
