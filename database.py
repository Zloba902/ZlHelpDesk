import sqlite3

DB_NAME = "helpdesk.db"

## работа с базой данных пользователей
def connect_db():
    con = sqlite3.connect(DB_NAME)
    return con


def create_user(token, ip, user_role, user_name, password, room_num):
    con = connect_db()
    cur = con.cursor()
    cur.execute(
        '''
            INSERT INTO accounts (token, ip, user_role, user_name, password, room_num) 
                VALUES (?, ?, ?, ?,?,?)
            ''',
        (token, ip, user_role, user_name, password, room_num),
    )
    con.commit()
    con.close()


def get_user_by_token(token):
    con = connect_db()
    cur = con.cursor()
    cur.execute('SELECT * FROM accounts WHERE token = ?', (token,))
    user = cur.fetchone()
    con.close()
    return user


def get_user_by_credentials(user_name, password):
    con = connect_db()
    cur = con.cursor()
    cur.execute('SELECT * FROM accounts WHERE user_name = ? AND password = ?', (user_name, password))
    user = cur.fetchone()
    con.close()
    return user


def update_ip_user(token, new_ip):
    con = connect_db()
    cur = con.cursor()
    cur.execute('UPDATE accounts SET ip = ? WHERE token = ?', (new_ip, token))
    con.commit()
    con.close()


def init_db():
    con = connect_db()
    cur = con.cursor()
    cur.execute('''CREATE TABLE IF NOT EXISTS accounts(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT UNIQUE,
        ip TEXT,
        user_role TEXT,
        user_name TEXT,
        password TEXT,
        room_num TEXT,
        status TEXT DEFAULT 'offline'
        )
    ''')

    cur.execute('''CREATE TABLE IF NOT EXISTS requests(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        title TEXT,
        request_text TEXT,
        code TEXT,
        status TEXT DEFAULT 'new',
        FOREIGN KEY (user_id) REFERENCES accounts(id),
        FOREIGN KEY (code) REFERENCES knowledge_base(code)
    )
    ''')

    cur.execute('''CREATE TABLE IF NOT EXISTS knowledge_base(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        code TEXT,
        content TEXT
    )
    ''')

    con.commit()
    con.close()

##База данных заявок

def create_request(user_id, title, request_text, code):
    con = connect_db()
    cur = con.cursor()
    cur.execute(
        '''
         INSERT INTO requests (user_id, title, request_text, code) 
               VALUES (?, ?, ?, ?)
           ''',
       (user_id, title, request_text, code),
    )
    con.commit()
    con.close()

def get_user_request(user_id):
    con = connect_db()
    cur = con.cursor()
    cur.execute('''
        SELECT r.id, r.title, r.request_text, r.status, r.code, u.user_name
        FROM requests r
        LEFT JOIN accounts u ON r.user_id = u.id
        WHERE r.user_id = ? AND r.status != 'Готово'
    ''', (user_id,))
    
    rows = cur.fetchall() 
    con.close()
    

    result = []
    for row in rows:
        result.append({
            "id": row[0],
            "title": row[1],
            "request_text": row[2],
            "status": row[3],
            "code": row[4],
            "user": row[5]
        })
    return result


def request_switch_status(request_id, new_status):
    con = connect_db()
    cur = con.cursor()
    cur.execute('UPDATE requests SET status = ? WHERE id = ?', (new_status, request_id))
    con.commit()
    con.close()



