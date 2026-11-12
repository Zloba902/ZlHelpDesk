import sqlite3

import os
import sys

if getattr(sys, 'frozen', False):
    # Если это EXE, сохраняем базу рядом с EXE файлом
    BASE_DIR = os.path.dirname(sys.executable)
else:
    # Если запуск из кода, сохраняем в папке проекта
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DB_NAME = os.path.join(BASE_DIR, "helpdesk.db")

KNOWLEDGE_BASE_SEED = [
    ("200", "printer", "Проблемы с принтером", "включить в розетку"),
    ("200", "printer", "Документ «застрял» в очереди печати",
     "Откройте «Устройства и принтеры», очистите очередь печати."),
    ("200", "printer", "Принтер горит красным / мигает",
     "Проверьте лоток с бумагой и плотность закрытия крышки картриджа."),
    (None, "internet", "Пишет «Без доступа к интернету»",
     "Попробуйте перезагрузить роутер или переподключить Wi-Fi."),
]

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


## Есть ли в базе хотя бы один администратор
def admin_exists():
    con = connect_db()
    cur = con.cursor()
    cur.execute("SELECT 1 FROM accounts WHERE user_role = 'admin' LIMIT 1")
    row = cur.fetchone()
    con.close()
    return row is not None


## Занят ли логин
def login_exists(login):
    con = connect_db()
    cur = con.cursor()
    cur.execute('SELECT 1 FROM accounts WHERE login = ?', (login,))
    row = cur.fetchone()
    con.close()
    return row is not None



def update_ip_user(token, new_ip):
    con = connect_db()
    cur = con.cursor()
    cur.execute('UPDATE accounts SET ip = ? WHERE token = ?', (new_ip, token))
    con.commit()
    con.close()


## Сбросить токен при выходе из системы
def clear_user_token(token):
    con = connect_db()
    cur = con.cursor()
    cur.execute('UPDATE accounts SET token = NULL WHERE token = ?', (token,))
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
        user_id INTEGER,
        title TEXT,
        request_text TEXT,
        category TEXT,
        status TEXT DEFAULT 'new',
        start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        close_date TIMESTAMP, 
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
        file_path TEXT, 
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (request_id) REFERENCES requests(id)
        )
    ''')

    # На новом сервере база знаний заполняется начальными записями
    if cur.execute('SELECT COUNT(*) FROM knowledge_base').fetchone()[0] == 0:
        cur.executemany(
            'INSERT INTO knowledge_base (eror_code, category, category_title, content) VALUES (?, ?, ?, ?)',
            KNOWLEDGE_BASE_SEED,
        )

    con.commit()
    con.close()

##База данных заявок


def create_request(user_id, title, request_text, category):
    con = connect_db()
    cur = con.cursor()
    cur.execute(
        '''
         INSERT INTO requests (user_id, title, request_text, category ) 
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
        SELECT r.id, r.title, r.request_text, r.status, r.category, u.user_name, r.start_date, r.close_date
        FROM requests r
        LEFT JOIN accounts u ON r.user_id = u.id
        WHERE r.user_id = ? 
        ORDER BY r.start_date DESC, r.id DESC
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
            "user": row[5],
            "start_date":row[6],
            "close_date":row[7]
        })
    return result

def get_all_request():
    con = connect_db()
    cur = con.cursor()
    cur.execute('''
        SELECT r.id, r.title, r.request_text, r.status, r.category, u.user_name, r.user_id, r.start_date, close_date
        FROM requests r
        LEFT JOIN accounts u ON r.user_id = u.id
        ORDER BY r.start_date DESC, r.id DESC
    ''')
    
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
            "user": row[5],
            "user_id": row[6],
            "start_date":row[7],
            "close_date":row[8]
        })
    return result



def get_request_owner(request_id):
    con = connect_db()
    cur = con.cursor()
    cur.execute("SELECT user_id FROM requests WHERE id = ?", (request_id,))
    row = cur.fetchone()
    con.close()
    return row[0] if row else None


def request_switch_status(request_id, new_status):
    con = connect_db()
    cur = con.cursor()
    if new_status == "done":
        cur.execute('UPDATE requests SET status = ?, close_date = COALESCE(close_date, CURRENT_TIMESTAMP) WHERE id = ?', (new_status, request_id))
    else:
        cur.execute('UPDATE requests SET status = ?, close_date = NULL  WHERE id = ?', (new_status, request_id))

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

def save_request_message(request_id, id_sender, id_reciev, text, message_type='text', file_path=None):
    con = connect_db()
    cur = con.cursor()
    cur.execute('''
        INSERT INTO messages (request_id, id_sender, id_reciev, message_text, message_type, file_path)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (request_id, id_sender, id_reciev, text, message_type, file_path))
    con.commit()
    con.close()

def get_request_chat_history(request_id):
    con = connect_db()
    cur = con.cursor()
    cur.execute('''
        SELECT id_sender, message_text, timestamp, message_type, file_path
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
            "timestamp": row[2],
            "type": row[3] or "text",
            "file_path": row[4],   # относительный путь, например "chat_uploads/<uuid>.png"
        })
    return history


def delete_request(request_id):
    con = connect_db()
    cur = con.cursor()
    cur.execute("DELETE FROM messages WHERE request_id = ?", (request_id,))
    cur.execute("DELETE FROM requests WHERE id = ?", (request_id,))
    con.commit()
    con.close()



def get_requests_statistics():
    """
    Возвращает агрегированную статистику по всем заявкам.
    Один коннект, несколько GROUP BY — быстро и без N+1.
    """
    con = connect_db()
    cur = con.cursor()

    # --- 1. Общие цифры ---
    cur.execute("SELECT COUNT(*) FROM requests")
    total = cur.fetchone()[0] or 0

    cur.execute("SELECT COUNT(*) FROM requests WHERE status = 'done'")
    done = cur.fetchone()[0] or 0

    active = total - done
    percent_done = round((done / total) * 100, 1) if total else 0.0

    # --- 2. Разбивка по статусам ---
    cur.execute("""
        SELECT status, COUNT(*) FROM requests GROUP BY status
    """)
    by_status = {row[0]: row[1] for row in cur.fetchall()}
    # гарантируем, что все 3 статуса есть в словаре (даже если 0)
    for s in ('new', 'process', 'done'):
        by_status.setdefault(s, 0)

    # --- 3. Разбивка по категориям (None = без темы, подпись делает фронт) ---
    cur.execute("""
        SELECT category, COUNT(*) AS cnt
        FROM requests
        GROUP BY category
        ORDER BY cnt DESC
    """)
    by_category = [{"category": r[0], "count": r[1]} for r in cur.fetchall()]

    # --- Динамика: сегодня и вчера по местному времени сервера ---
    # Даты в базе хранятся в UTC, поэтому переводим их через 'localtime'
    cur.execute("""
        SELECT
            SUM(CASE WHEN date(start_date, 'localtime') = date('now', 'localtime')
                     THEN 1 ELSE 0 END),
            SUM(CASE WHEN date(start_date, 'localtime') = date('now', 'localtime', '-1 day')
                     THEN 1 ELSE 0 END),
            SUM(CASE WHEN status = 'done'
                      AND date(close_date, 'localtime') = date('now', 'localtime')
                     THEN 1 ELSE 0 END),
            SUM(CASE WHEN status = 'done'
                      AND date(close_date, 'localtime') = date('now', 'localtime', '-1 day')
                     THEN 1 ELSE 0 END)
        FROM requests
    """)
    # SUM по пустой таблице возвращает NULL, поэтому заменяем его на 0
    created_today, created_yesterday, closed_today, closed_yesterday = \
        [value or 0 for value in cur.fetchone()]

    # --- Среднее время решения в часах (выполненные заявки с обеими датами) ---
    cur.execute("""
        SELECT AVG((julianday(close_date) - julianday(start_date)) * 24)
        FROM requests
        WHERE status = 'done' AND close_date IS NOT NULL AND start_date IS NOT NULL
    """)
    avg_hours = cur.fetchone()[0]
    avg_resolution_hours = round(avg_hours, 2) if avg_hours is not None else None

    # --- Самая частая тема у каждого пользователя ---
    cur.execute("""
        SELECT user_id, category, COUNT(*) AS cnt
        FROM requests
        GROUP BY user_id, category
        ORDER BY user_id, cnt DESC
    """)
    top_category = {}
    for user_id, category, cnt in cur.fetchall():
        # строки отсортированы по убыванию, поэтому первая и есть самая частая
        top_category.setdefault(user_id, category)

    # --- 4. По пользователям (топ всех, фронт обрежет если надо) ---
    cur.execute("""
        SELECT
            u.id,
            u.user_name,
            u.room_num,
            COUNT(r.id)                                    AS total,
            SUM(CASE WHEN r.status != 'done' THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN r.status =  'done' THEN 1 ELSE 0 END) AS done
        FROM accounts u
        LEFT JOIN requests r ON r.user_id = u.id
        WHERE u.user_role != 'admin'          -- админов в статистику не мешаем
        GROUP BY u.id
        HAVING total > 0
        ORDER BY total DESC
    """)
    by_user = [
        {
            "id":        r[0],
            "user_name": r[1],
            "room_num":  r[2],
            "total":     r[3],
            "active":    r[4],
            "done":      r[5],
            "top_category": top_category.get(r[0]),
        }
        for r in cur.fetchall()
    ]

    con.close()

    return {
        "total":         total,
        "active":        active,
        "done":          done,
        "percent_done":  percent_done,
        "by_status":     by_status,
        "by_category":   by_category,
        "by_user":       by_user,
        "created_today":     created_today,
        "created_yesterday": created_yesterday,
        "closed_today":      closed_today,
        "closed_yesterday":  closed_yesterday,
        "avg_resolution_hours": avg_resolution_hours,
    }