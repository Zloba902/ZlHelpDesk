import sqlite3

DB_NAME = "helpdesk.db"

## работа с базой данных пользователей


## Подключение базы
def connect_db():
    con = sqlite3.connect(DB_NAME)
    return con


## Создание пользователя
def create_user(login, token, ip, user_role, user_name, password, room_num):
    con = connect_db()
    cur = con.cursor()
    cur.execute(
        '''
            INSERT INTO accounts ( login,token, ip, user_role, user_name, password, room_num) 
                VALUES (?,?, ?, ?, ?,?,?)
            ''',
        (login, token, ip, user_role, user_name, password, room_num),
    )
    con.commit()
    con.close()


## Вернуть пользователя по токену
def get_user_by_token(token):
    con = connect_db()
    cur = con.cursor()
    cur.execute('SELECT * FROM accounts WHERE token = ?', (token,))
    user = cur.fetchone()
    con.close()
    return user

## Вернуть пользователя по имени и паролю
def get_user_by_credentials(login, password):
    con = connect_db()
    cur = con.cursor()
    cur.execute('SELECT * FROM accounts WHERE login = ? AND password = ?', (login, password))
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
        login TEXT UNIQUE NOT NULL,
        token TEXT,
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
        category TEXT,
        status TEXT DEFAULT 'new',
        FOREIGN KEY (user_id) REFERENCES accounts(id),
        FOREIGN KEY (category) REFERENCES knowledge_base(category)
    )
    ''')

    cur.execute('''CREATE TABLE IF NOT EXISTS knowledge_base(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        eror_code  TEXT,
        category TEXT NOT NULL,
        category_title TEXT,
        content TEXT
    )
    ''')

    cur.execute('''
        CREATE TABLE IF NOT EXISTS messages (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id INTEGER NOT NULL,          
        id_sender INTEGER NOT NULL,           
        id_reciev INTEGER NOT NULL,           
        message_text TEXT NOT NULL,          
        message_type TEXT DEFAULT 'text',     
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (request_id) REFERENCES requests(id)
        )
    ''')
    
    con.commit()
    con.close()

##База данных заявок


def create_request(user_id, title, request_text, category):
    con = connect_db()
    cur = con.cursor()
    cur.execute(
        '''
         INSERT INTO requests (user_id, title, request_text, category) 
               VALUES (?, ?, ?, ?)
           ''',
       (user_id, title, request_text, category),
    )
    con.commit()
    con.close()

def get_user_request(user_id):
    con = connect_db()
    cur = con.cursor()
    cur.execute('''
        SELECT r.id, r.title, r.request_text, r.status, r.category, u.user_name
        FROM requests r
        LEFT JOIN accounts u ON r.user_id = u.id
        WHERE r.user_id = ? AND r.status != 'done'
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
            "category": row[4],
            "user": row[5]
        })
    return result


def request_switch_status(request_id, new_status):
    con = connect_db()
    cur = con.cursor()
    cur.execute('UPDATE requests SET status = ? WHERE id = ?', (new_status, request_id))
    con.commit()
    con.close()


def get_users_with_active_requests():
    con = connect_db()
    cursor = con.cursor()

   
    cursor.execute('''
        SELECT DISTINCT a.id, a.ip, a.user_name, a.room_num, count(a.id)
        FROM accounts a
        INNER JOIN requests r ON a.id = r.user_id
        WHERE r.status != 'done'
        Group BY a.id ;
    ''')
    
    rows = cursor.fetchall()
    con.close()
    
    active_users = []
    for row in rows:
        active_users.append({
            "id": row[0],
            "ip": row[1],
            "user_name": row[2],
            "room_num": row[3],
            "count": row[4],
        })
    return active_users

def get_knowledge_solutions(category):
    if not category:
        return []

    con = connect_db()
    cur = con.cursor()

    cur.execute('''
        SELECT category_title, content 
        FROM knowledge_base 
        WHERE category = ?
    ''', (category,))

    rows = cur.fetchall()
    con.close()

    solotions = []
    for row in rows:
        solotions.append({
            "title": row[0],
            "solution": row[1]
        })
    return solotions    



#КОМАНДЫ ДЛЯ РАБОТЫ С БД ЧАТА

def save_request_message(request_id, id_sender, id_reciev, text):
    con = connect_db()
    cur = con.cursor()
    cur.execute('''
        INSERT INTO messages (request_id, id_sender, id_reciev, message_text)
        VALUES (?, ?, ?, ?)
    ''', (request_id, id_sender, id_reciev, text))
    con.commit()
    con.close()

def get_request_chat_history(request_id):
    con = connect_db()
    cur = con.cursor()
    cur.execute('''
        SELECT id_sender, message_text, timestamp 
        FROM messages 
        WHERE request_id = ?
        ORDER BY timestamp ASC
    ''', (request_id,))
    
    rows = cur.fetchall()
    con.close()
    
    history = []
    for row in rows:
        history.append({
            "sender_id": row[0],
            "text": row[1],
            "timestamp": row[2]
        })
    return history


