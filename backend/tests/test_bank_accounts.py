import pytest
from unittest.mock import patch

def test_client_get_bank_accounts(client_user_client):
    with patch("routers.client.get_eligible_accounts_for_client") as mock_get:
        mock_get.return_value = [
            {
                "id": "bank1",
                "label": "Test Bank",
                "upi_id": "test@upi",
                "account_number": "123",
                "ifsc": "TEST001",
                "remaining_capacity": 50000.0
            }
        ]
        
        response = client_user_client.get("/api/client/bank-accounts")
        
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["label"] == "Test Bank"
        assert data[0]["remaining_capacity"] == 50000.0

def test_admin_create_bank_account(admin_client):
    with patch("routers.admin.create_bank_account") as mock_create:
        mock_create.return_value = {"id": "new_bank", "label": "New Bank"}
        
        response = admin_client.post("/api/admin/bank-accounts", json={
            "label": "New Bank",
            "limit_amount": 100000.0
        })
        
        assert response.status_code == 201
        assert response.json()["id"] == "new_bank"

def test_employee_cannot_create_bank_account(employee_client):
    # Employees don't have access to the admin router endpoints
    response = employee_client.post("/api/admin/bank-accounts", json={
        "label": "New Bank",
        "limit_amount": 100000.0
    })
    
    assert response.status_code == 403
    assert "Not enough permissions" in response.json()["detail"]
