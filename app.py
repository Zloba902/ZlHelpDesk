
import uuid
import os
import time
import hmac
import hashlib
import getpass
import threading
import multiprocessing
from flask import Flask, request, make_response, redirect, url_for
from flask import render_template
from flask import jsonify
from flask import send_from_directory
from database import (
    connect_db, init_db, create_user, get_user_by_token, update_ip_user,
    create_request, get_user_by_credentials, get_user_request,
    request_switch_status, get_knowledge_solutions,
    get_users_with_active_requests, save_request_message,
    get_request_chat_history,
    get_all_request,
    get_requests_statistics,          # ← добавить
    clear_user_token,
)
from functools import wraps
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from database import get_request_owner 
from database import delete_request
import socket
import subprocess
import sys


if getattr(sys, 'frozen', False):
    # Если приложение запущено как EXE, берем путь из временной папки
    template_folder = os.path.join(sys._MEIPASS, 'templates')
    static_folder = os.path.join(sys._MEIPASS, 'static')
    BASE_DIR = os.path.dirname(sys.executable)
    app = Flask(__name__, template_folder=template_folder, static_folder=static_folder)
else:
    # Обычный запуск из кода
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    app = Flask(__name__)
init_db()

UPLOAD_DIR = os.path.join(BASE_DIR, "chat_uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 М

ALLOWED_STATUSES = {"new", "process", "done"}

# HTTPS включается, если заданы пути к сертификату и ключу
SSL_CERT = os.environ.get("HELPDESK_SSL_CERT")
SSL_KEY = os.environ.get("HELPDESK_SSL_KEY")
USE_HTTPS = bool(SSL_CERT and SSL_KEY)

COOKIE_MAX_AGE = 60 * 60 * 24 * 7  # 7 дней

# Ограничение попыток входа: не больше MAX_LOGIN_FAILS ошибок с одного IP за окно
MAX_LOGIN_FAILS = 10
LOGIN_FAIL_WINDOW = 5 * 60  # секунд
login_fails = {}            # ip -> список времени неудачных попыток
login_fails_lock = threading.Lock()

# Эти адреса вызываются со страницы входа, где сессии ещё нет
CSRF_EXEMPT = {"login_user", "register_user"}

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def set_auth_cookie(response, user_token):
    response.set_cookie(
        "user_token", user_token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,        # JavaScript не может прочитать токен
        samesite="Lax",       # cookie не уходит с POST-запросами с чужих сайтов
        secure=USE_HTTPS,
    )


def csrf_token_for(user_token):
    # Токен сессии лежит в HttpOnly-cookie, поэтому чужой сайт не может вычислить хэш
    return hashlib.sha256(f"csrf:{user_token}".encode()).hexdigest()


@app.before_request
def csrf_protect():
    if request.method != "POST" or request.endpoint in CSRF_EXEMPT:
        return None
    user_token = request.cookies.get("user_token")
    if not user_token:
        return None           # без сессии запрос отклонит сам обработчик
    sent = request.headers.get("X-CSRF-Token") or request.form.get("csrf_token", "")
    if not hmac.compare_digest(sent.encode(), csrf_token_for(user_token).encode()):
        return jsonify({"error": "bad csrf token"}), 403
    return None


@app.context_processor
def inject_csrf_token():
    user_token = request.cookies.get("user_token")
    return {"csrf_token": csrf_token_for(user_token) if user_token else ""}


def recent_login_fails(ip):
    # Вызывать только под login_fails_lock
    now = time.time()
    fails = [t for t in login_fails.get(ip, []) if now - t < LOGIN_FAIL_WINDOW]
    if fails:
        login_fails[ip] = fails
    else:
        login_fails.pop(ip, None)
    return fails


def login_blocked(ip):
    with login_fails_lock:
        return len(recent_login_fails(ip)) >= MAX_LOGIN_FAILS


def register_login_fail(ip):
    with login_fails_lock:
        login_fails[ip] = recent_login_fails(ip) + [time.time()]


def clear_login_fails(ip):
    with login_fails_lock:
        login_fails.pop(ip, None)


## Получаем скисок пользователей и их ип

def registered_devices():
    conn = connect_db()
    cursor = conn.cursor()

    cursor.execute("SELECT id, ip, user_name, room_num FROM accounts")
    rows = cursor.fetchall()
    conn.close()
    registered_device = []
    for row in rows:
        registered_device.append({
            "id": row[0],
            "ip": row[1],
            "user_name": row[2],
            "room_num": row[3]
        })
    return registered_device

def can_access_request(user, request_id):
    owner_id = get_request_owner(request_id)
    if owner_id is None:
        return False
    if user[4] == "admin":
        return True
    return user[0] == owner_id 

def login_required(role=None):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            token = request.cookies.get("user_token")
            user = get_user_by_token(token) if token else None
            if not user:
                return jsonify({"error": "unauthorized"}), 401
            if role and user[4] != role:   # user[4] — колонка user_role
                return jsonify({"error": "forbidden"}), 403
            # прокидываем пользователя в функцию, чтобы не доставать повторно
            return f(*args, user=user, **kwargs)
        return wrapper
    return decorator


## начальная страница что перекидыват пользователя дальше
@app.route("/")
def home():
    user_ip = request.remote_addr
    user_token = request.cookies.get("user_token")

    if user_token:
        user = get_user_by_token(user_token)
        if user:
            update_ip_user(user_token, user_ip)
    return render_template("register.html", client_ip=user_ip)


## Обработка обращения пользователя
@app.route("/send_request", methods=["POST"])
def send_request():
    user_token = request.cookies.get("user_token")
    user = get_user_by_token(user_token)
    if not user:
        return redirect(url_for("home"))

    request_title = request.form.get("title")
    request_text = request.form.get("request_text")
    request_category = request.form.get("category") 

    create_request(user[0], request_title, request_text, request_category)
    return redirect(url_for("user_panel"))


## РОУТЫ

## вывод заявок пользоывтелей
@app.route("/api/requests")
@app.route("/api/requests/<int:user_id>")
@login_required()
def get_requests_api(user, user_id=None):
    if user_id is None:
        # Все заявки — только админ
        if user[4] != "admin":
            return jsonify({"error": "forbidden"}), 403
        return jsonify(get_all_request())
    # Заявки конкретного пользователя
    if user[4] != "admin" and user[0] != user_id:
        return jsonify({"error": "forbidden"}), 403
    return jsonify(get_user_request(user_id))

@app.route("/api/requests/statistics")
@login_required(role="admin")
def get_statistics_api(user):
    return jsonify(get_requests_statistics())

## смена статуса заявки
@app.route("/api/request_switch/<int:request_id>/<new_status>", methods=["POST"])
@login_required(role="admin")
def request_switch(request_id, new_status, user):
    if new_status not in ALLOWED_STATUSES:
        return jsonify({"error": "bad status"}), 400
    request_switch_status(request_id, new_status)
    return jsonify({"status": "success", "message": "Статус успешно обновлен"})
    

## вывод возможного решения
@app.route("/api/get_solution/<category>")
@login_required()
def get_solution_api(category,user):
    solutions_list = get_knowledge_solutions(category) # Вызывает функцию с fetchall()
    if solutions_list:
        return jsonify({"status": "success", "data": solutions_list})
    return jsonify({"status": "not_found"})

## вовод чата
@app.route("/api/get_chat/<int:request_id>")
@login_required()
def get_chat(request_id, user):
    if not can_access_request(user, request_id):
        return jsonify({"error": "forbidden"}), 403

    history = get_request_chat_history(request_id)
    return jsonify({"status": "success", "history": history})

## вывод отмена заявки
@app.route("/api/cancel_request/<int:request_id>", methods=["POST"])
@login_required()
def cancel_request(request_id, user):

    if not can_access_request(user, request_id):
        return jsonify({"error": "forbidden"}), 403
    
    delete_request(request_id)
    return jsonify({"status": "success", "message": "Заявка удалена"})

## отправка сообщения
@app.route("/api/send_chat_message", methods=["POST"])
@login_required()               # ???
def send_chat_message(user):
    data = request.json # Принимаем JSON от JavaScript
    request_id = data.get("request_id") #получает от джейсон даты ид запроса
    message_text = (data.get("text") or "").strip() # получаем текст сообщения из джейсона или если его нет оставляем пустым, удаляем пробелы с начала и конца
    if not message_text: 
        return jsonify({"error": "empty message"}), 400

    try:
        request_id = int(data.get("request_id"))
    except (TypeError, ValueError):
        return jsonify({"error": "invalid request_id"}), 400

    message_text = (data.get("text") or "").strip()
    if not message_text:
        return jsonify({"error": "empty message"}), 400
    if len(message_text) > 2000:                      # защита от флуда
        return jsonify({"error": "message too long"}), 400

    # одна проверка вместо ручной возни с БД
    if not can_access_request(user, request_id):
        return jsonify({"error": "forbidden"}), 403

    id_sender = user[0]
    sender_role = user[4]

    if sender_role == "admin":
        id_reciev = get_request_owner(request_id)
    else:
        con = connect_db()
        cur = con.cursor()
        cur.execute("SELECT id FROM accounts WHERE user_role = 'admin' LIMIT 1")
        adm = cur.fetchone()
        con.close()
        id_reciev = adm[0] if adm else 0

    save_request_message(request_id, id_sender, id_reciev, message_text)
    return jsonify({"status": "success"})

### -- ТЕСТОВОЕ -----

@app.route("/api/upload_chat_file/<int:request_id>", methods=["POST"])
@login_required()
def upload_chat_file(request_id, user):
    if not can_access_request(user, request_id):
        return jsonify({"error": "forbidden"}), 403

    file = request.files.get("file")
    if not file or file.filename == "":
        return jsonify({"error": "no file"}), 400
    if not allowed_file(file.filename):
        return jsonify({"error": "bad extension"}), 400

    # проверка размера (можно ещё через request.content_length до чтения)
    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)
    if size > MAX_FILE_SIZE:
        return jsonify({"error": "too large"}), 400

    ext = file.filename.rsplit(".", 1)[1].lower()
    fname = f"{uuid.uuid4().hex}.{ext}"
    # опционально: разложить по подпапкам request_<id>/
    req_dir = os.path.join(UPLOAD_DIR, str(request_id))
    os.makedirs(req_dir, exist_ok=True)
    save_path = os.path.join(req_dir, fname)
    file.save(save_path)

    # относительный путь для БД (то, что потом отдадим клиенту)
    rel_path = f"chat_uploads/{request_id}/{fname}"

    # определяем получателя (как в send_chat_message)
    if user[4] == "admin":
        id_reciev = get_request_owner(request_id)
    else:
        con = connect_db(); cur = con.cursor()
        cur.execute("SELECT id FROM accounts WHERE user_role='admin' LIMIT 1")
        adm = cur.fetchone(); con.close()
        id_reciev = adm[0] if adm else 0

    save_request_message(
        request_id, user[0], id_reciev,
        text="",                       # у картинки текст пустой (или подпись)
        message_type="image",
        file_path=rel_path
    )

    return jsonify({
        "status": "success",
        "file_path": rel_path,
        "url": url_for("chat_upload", filename=f"{request_id}/{fname}")
    })


@app.route("/chat_uploads/<path:filename>")
@login_required()
def chat_upload(filename, user):
    # filename = "12/uuid.png" — проверяем, что юзер имеет доступ к заявке 12
    try:
        request_id = int(filename.split("/")[0])
    except (ValueError, IndexError):
        return jsonify({"error": "bad path"}), 400
    if not can_access_request(user, request_id):
        return jsonify({"error": "forbidden"}), 403
    return send_from_directory(UPLOAD_DIR, filename)

## РЕГИСТРАЦИЯ, ЛОГИН, ЛОГАУТ


@app.route("/register", methods=["POST"])
def register_user():

    login = request.form.get("login")
    name = request.form.get("user_name")
    room = request.form.get("room")
    user_ip = request.remote_addr
    user_token = str(uuid.uuid4())
    user_role = "user"   # админы создаются только командой create-admin
    password = request.form.get("password")
    password_hash = generate_password_hash(password)

    con = connect_db()
    cur = con.cursor()
    cur.execute("SELECT id FROM accounts WHERE login = ?", (login,))
    if cur.fetchone():
        con.close()
        return make_response("Пользователь с таким логином уже существует", 400)
    con.close()

    create_user(login, user_token, user_ip, user_role ,name, password_hash ,room)
    response = make_response(redirect(url_for('user_panel')))
    set_auth_cookie(response, user_token)

    return response


@app.route("/login", methods=["POST"])
def login_user():
    login = request.form.get("login")
    password = request.form.get("password")
    user_ip = request.remote_addr

    if login_blocked(user_ip):
        return make_response("Слишком много попыток входа. Попробуйте через несколько минут", 429)

    con = connect_db()
    cur = con.cursor()
    cur.execute("SELECT * FROM accounts WHERE login = ?", (login,))
    user = cur.fetchone()
    con.close()

    if not user or not check_password_hash(user[6], password or ""):  # user[6] = password
        register_login_fail(user_ip)
        return make_response("Неправильный логин или пароль", 401)

    clear_login_fails(user_ip)
    user_token = str(uuid.uuid4())
    con = connect_db()
    cur = con.cursor()
    cur.execute("UPDATE accounts SET token = ? WHERE id = ?", (user_token, user[0]))
    con.commit()
    con.close()

    response = make_response(redirect(url_for('admin_panel' if user[4] == 'admin' else 'user_panel')))
    set_auth_cookie(response, user_token)
    return response


@app.route("/logout", methods=["POST"])
def logout():
    user_token = request.cookies.get("user_token")
    if user_token:
        clear_user_token(user_token)   # старый токен больше не действует

    response = make_response(redirect(url_for("home")))
    response.delete_cookie("user_token")
    return response

    
@app.route("/admin")
def admin_panel():
    user_token = request.cookies.get("user_token")
    user = get_user_by_token(user_token)
    if not user or user[4] != "admin":
        return redirect(url_for("home"))


    return render_template("start_page_admin.html",
                            devices=get_users_with_active_requests(),
                            name=user[5],
                            admin_id = user[0])


@app.route("/user")
def user_panel():
    user_token = request.cookies.get("user_token")
    user = get_user_by_token(user_token)
    if not user:
        return redirect(url_for("home"))

    
    user_ip = request.remote_addr
    update_ip_user(user_token, user_ip)

    user_id = user[0]
    # Заявки загружает user.js через /api/requests/<user_id>
    return render_template("start_page_user.html", user_id = user_id)



def get_wifi_ip():
    # Получаем список всех сетевых интерфейсов
    try:
        # Выполняем команду ip addr
        result = subprocess.check_output(['ip', '-4', 'addr', 'show'], text=True)
        
        # Ищем строку, которая начинается на 192.168 или 10.
        for line in result.split('\n'):
            line = line.strip()
            if line.startswith('inet ') and ('192.168.' in line or line.startswith('inet 10.')):
                # Извлекаем сам IP адрес (отделяем от маски /24)
                ip = line.split()[1].split('/')[0]
                return ip
    except Exception as e:
        pass
        
    return "127.0.0.1"

def create_admin_cli():
    """Создаёт администратора из консоли: python app.py create-admin"""
    login = input("Логин: ").strip()
    name = input("Имя: ").strip()
    password = getpass.getpass("Пароль: ")
    if not login or not name or not password:
        sys.exit("Логин, имя и пароль обязательны")
    if password != getpass.getpass("Повторите пароль: "):
        sys.exit("Пароли не совпадают")

    con = connect_db()
    exists = con.execute("SELECT id FROM accounts WHERE login = ?", (login,)).fetchone()
    con.close()
    if exists:
        sys.exit("Пользователь с таким логином уже существует")

    create_user(login, str(uuid.uuid4()), "", "admin", name, generate_password_hash(password), "")
    print(f"Администратор {login} создан")


if __name__ == "__main__":
    multiprocessing.freeze_support()
    if sys.argv[1:] == ["create-admin"]:
        create_admin_cli()
        sys.exit(0)

    local_ip = get_wifi_ip()
    scheme = "https" if USE_HTTPS else "http"
    print("=" * 50)
    print(f" САЙТ ЗАПУЩЕН!")
    print(f" локально:  {scheme}://127.0.0.1:5000")
    print(f" для других в сети: {scheme}://{local_ip}:5000")
    print("=" * 50)
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=os.environ.get("HELPDESK_DEBUG") == "1",   # только для разработки
        ssl_context=(SSL_CERT, SSL_KEY) if USE_HTTPS else None,
    )
