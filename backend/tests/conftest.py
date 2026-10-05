import os
import tempfile

# Point the app at a throwaway database before any app module is imported.
_db = os.path.join(tempfile.mkdtemp(prefix="wandermind-test-"), "test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_db}"
os.environ["GROQ_API_KEY"] = "test-key"
os.environ["SEARXNG_URL"] = "http://127.0.0.1:9"
