import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch

from main import app
from auth.dependencies import get_current_user

# Mock users for dependency override
mock_admin_user = {"sub": "admin123", "role": "admin", "display_name": "Admin User"}
mock_employee_user = {"sub": "emp123", "role": "employee", "display_name": "Employee User"}
mock_client_user = {"sub": "client123", "role": "client", "display_name": "Client User"}

@pytest.fixture
def client():
    # Provide an unauthenticated client
    return TestClient(app)

@pytest.fixture
def admin_client():
    app.dependency_overrides[get_current_user] = lambda: mock_admin_user
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()

@pytest.fixture
def employee_client():
    app.dependency_overrides[get_current_user] = lambda: mock_employee_user
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()

@pytest.fixture
def client_user_client():
    app.dependency_overrides[get_current_user] = lambda: mock_client_user
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()

@pytest.fixture
def mock_db():
    with patch("database.get_supabase") as mock_get_db:
        db = MagicMock()
        mock_get_db.return_value = db
        yield db
