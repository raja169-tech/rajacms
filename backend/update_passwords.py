import asyncio
import bcrypt
from database import get_supabase

async def update_passwords():
    print("Updating passwords in Supabase...")
    db = get_supabase()
    
    # Generate hashes
    admin_hash = bcrypt.hashpw(b'admin123', bcrypt.gensalt(12)).decode()
    emp_hash = bcrypt.hashpw(b'emp123', bcrypt.gensalt(12)).decode()
    client_hash = bcrypt.hashpw(b'client123', bcrypt.gensalt(12)).decode()
    
    # Update admin
    db.table('users').update({
        'password_hash': admin_hash
    }).eq('login_identifier', 'admin').execute()
    print("Admin password updated to: admin123")
    
    # Update employee
    db.table('users').update({
        'password_hash': emp_hash
    }).eq('login_identifier', 'employee01').execute()
    print("Employee password updated to: emp123")
    
    # Update client 1
    db.table('users').update({
        'password_hash': client_hash
    }).eq('login_identifier', '100001').execute()
    print("Client 1 password updated to: client123")
    
    # Update client 2
    db.table('users').update({
        'password_hash': client_hash
    }).eq('login_identifier', '100002').execute()
    print("Client 2 password updated to: client123")

if __name__ == "__main__":
    asyncio.run(update_passwords())
