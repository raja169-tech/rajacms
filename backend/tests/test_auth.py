import pytest
from unittest.mock import patch

def test_login_success(client, mock_db):
    # Setup mock user response
    mock_db.table().select().eq().maybe_single().execute.return_value.data = {
        "id": "123",
        "client_code": "admin",
        "password_hash": "$2b$12$eImiTXuWVxfM37uY4JANjQ==...", # dummy hash
        "role": "admin",
        "is_active": True,
        "force_password_change": False,
        "display_name": "Admin",
        "fee_percentage": 0.0
    }
    
    # Mock password verification and token generation
    with patch("routers.auth.verify_password", return_value=True), \
         patch("routers.auth.create_access_token", return_value="access_token_123"), \
         patch("routers.auth.create_refresh_token", return_value="refresh_token_123"):
         
        response = client.post("/api/auth/login", json={
            "login_identifier": "admin",
            "password": "correct_password"
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["access_token"] == "access_token_123"
        assert data["role"] == "admin"

def test_login_invalid_credentials(client, mock_db):
    # User not found
    mock_db.table().select().eq().maybe_single().execute.return_value.data = None
    
    response = client.post("/api/auth/login", json={
        "login_identifier": "unknown",
        "password": "password"
    })
    
    assert response.status_code == 401
    assert "Invalid credentials" in response.json()["detail"]

def test_role_guard_client_accessing_admin(client_user_client):
    # Client tries to access admin dashboard
    response = client_user_client.get("/api/admin/dashboard/summary")
    assert response.status_code == 403
    assert "Not enough permissions" in response.json()["detail"]

def test_role_guard_admin_accessing_admin(admin_client, mock_db):
    # Admin tries to access admin dashboard
    mock_db.table().select().eq().maybe_single().execute.return_value.data = {"count": 0}
    
    with patch("routers.admin.get_dashboard_summary", return_value={
        "pending_transactions": 5,
        "total_clients": 10,
        "this_month": {"net_volume": 1000, "fees_collected": 100, "pay_in_gross": 1100}
    }):
        response = admin_client.get("/api/admin/dashboard/summary")
        assert response.status_code == 200
        assert response.json()["pending_transactions"] == 5
