import pytest
from unittest.mock import patch
from decimal import Decimal

def test_get_client_transactions(client_user_client, mock_db):
    # Setup mock response for transactions
    mock_db.table().select().eq().order().range().execute.return_value.data = [
        {"id": "txn1", "type": "pay_in", "gross_amount": 1000, "status": "approved"}
    ]
    mock_db.table().select().eq().order().range().execute.return_value.count = 1

    response = client_user_client.get("/api/client/transactions")
    
    assert response.status_code == 200
    data = response.json()
    assert len(data["transactions"]) == 1
    assert data["transactions"][0]["type"] == "pay_in"
    assert data["total"] == 1

def test_submit_pay_out_success(client_user_client):
    with patch("routers.client.submit_pay_out") as mock_submit:
        mock_submit.return_value = {
            "id": "txn_payout",
            "type": "pay_out",
            "net_amount": 500.0,
            "status": "pending"
        }
        
        response = client_user_client.post("/api/client/pay-out", json={
            "amount": 500.0
        })
        
        assert response.status_code == 201
        data = response.json()
        assert data["type"] == "pay_out"
        assert data["net_amount"] == 500.0

def test_admin_approve_transaction(admin_client):
    with patch("routers.admin.process_transaction_approval") as mock_process:
        mock_process.return_value = {"status": "success", "message": "Transaction approved"}
        
        response = admin_client.post("/api/admin/transactions/txn123/approve", json={
            "admin_notes": "All good"
        })
        
        assert response.status_code == 200
        assert response.json()["status"] == "success"
        
        # Verify it passed the right args
        mock_process.assert_called_once_with("txn123", "approve", "admin123", "All good")

def test_employee_reject_transaction(employee_client):
    with patch("routers.employee.process_transaction_approval") as mock_process:
        mock_process.return_value = {"status": "success"}
        
        response = employee_client.post("/api/employee/transactions/txn123/reject", json={
            "reason": "Proof invalid"
        })
        
        assert response.status_code == 200
        assert response.json()["status"] == "success"
        
        # Verify reason was passed
        mock_process.assert_called_once_with("txn123", "reject", "emp123", "Proof invalid")
