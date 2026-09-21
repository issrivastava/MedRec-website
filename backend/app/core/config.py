from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./medrec.db"
    SECRET_KEY: str = "change-me-dev-only"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7
    ALGORITHM: str = "HS256"
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_MB: int = 15
    VIDEO_MAX_UPLOAD_MB: int = 100  # test-result video clips (photos/PDFs use MAX_UPLOAD_MB)
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.1:8b"
    OLLAMA_TIMEOUT_SEC: int = 120
    # Better document understanding (optional, pulled on demand):
    #   ollama pull qwen2.5:7b     (sharper extraction / classification)
    #   ollama pull moondream      (tiny vision model — reads scan photos directly)
    OLLAMA_FALLBACK_MODEL: str = "qwen2.5:7b"
    OLLAMA_VISION_MODEL: str = "moondream"
    OLLAMA_UNDERSTAND_TIMEOUT_SEC: int = 180
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174,http://localhost:3000"
    FIREBASE_CREDENTIALS_PATH: str = ""  # path to Firebase service-account JSON; empty = Firebase login disabled
    ADMIN_SIGNUP_KEY: str = ""  # required as admin_key to register role=admin; empty = disabled
    MAIL_HOST: str = ""
    MAIL_PORT: int = 587
    MAIL_USER: str = ""
    MAIL_PASSWORD: str = ""
    MAIL_FROM: str = ""
    SMS_WEBHOOK_URL: str = ""  # POST {to, message} as JSON when set
    SMS_DEFAULT_PREFIX: str = "+91"  # prepended to bare 10-digit numbers
    SMS_SENDER_ID: str = "MedRec"  # sent as {from} in the webhook payload when supported
    OTP_EXPIRE_MINUTES: int = 10  # how long an email OTP stays valid
    OTP_RESEND_SECONDS: int = 60  # min gap between OTP requests per email+purpose
    OTP_MAX_ATTEMPTS: int = 5  # wrong-code attempts before the code is voided
    OTP_DEV_ECHO: bool = False  # NEVER True in production: True echoes the OTP in the API response (anyone on the network can read it). Keep False so codes only travel via email/SMS; server console log is the only dev fallback.
    # --- Medicine Description (free openFDA + Tata 1mg links) ---
    # Best FREE drug-data source: openFDA — works WITHOUT any key.
    # Get an optional free key at https://open.fda.gov/apis/authentication/
    # to raise limits (40 -> 240 req/min, 1000 -> 120k req/day).
    OPENFDA_API_KEY: str = ""
    OPENFDA_BASE_URL: str = "https://api.fda.gov/drug/label.json"
    # Tata 1mg has NO official public API, so results link out to Tata 1mg
    # search pages. If you have an UNOFFICIAL proxy (e.g. RapidAPI mirror),
    # set these and the backend will try it first, then fall back to openFDA.
    TATA1MG_API_KEY: str = ""
    TATA1MG_API_URL: str = ""
    TATA1MG_SEARCH_URL: str = "https://www.1mg.com/search/all"
    MEDICINES_CACHE_TTL_SEC: int = 3600
    # --- Disease Description (free Wikipedia API, no key needed) ---
    DISEASES_CACHE_TTL_SEC: int = 86400  # disease info changes rarely
    # --- AI doubt-solver (free Gemini tier, local Ollama fallback) ---
    # Free key: https://aistudio.google.com/apikey (no card needed).
    # Empty = Gemini skipped, local Ollama used if running; if neither is
    # available the endpoint returns 503 with setup instructions.
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"
    GEMINI_TIMEOUT_SEC: int = 60

    class Config:
        env_file = ".env"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
