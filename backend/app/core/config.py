from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./medrec.db"
    SECRET_KEY: str = "change-me-dev-only"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7
    ALGORITHM: str = "HS256"
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_MB: int = 15
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.1:8b"
    OLLAMA_TIMEOUT_SEC: int = 120
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    FIREBASE_CREDENTIALS_PATH: str = ""  # path to Firebase service-account JSON; empty = Firebase login disabled
    ADMIN_SIGNUP_KEY: str = ""  # required as admin_key to register role=admin; empty = disabled
    MAIL_HOST: str = ""
    MAIL_PORT: int = 587
    MAIL_USER: str = ""
    MAIL_PASSWORD: str = ""
    MAIL_FROM: str = ""
    SMS_WEBHOOK_URL: str = ""  # POST {to, message} as JSON when set
    OTP_EXPIRE_MINUTES: int = 10  # how long an email OTP stays valid
    OTP_RESEND_SECONDS: int = 60  # min gap between OTP requests per email+purpose
    OTP_MAX_ATTEMPTS: int = 5  # wrong-code attempts before the code is voided
    OTP_DEV_ECHO: bool = True  # when True AND no MAIL_HOST is set, return the OTP in the API response for local dev

    class Config:
        env_file = ".env"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
