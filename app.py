
import uuid
from flask import Flask, request, make_response, redirect, url_for
from flask import render_template
from flask import jsonify
from database import connect_db, init_db, create_user, get_user_by_token, update_ip_user, create_request, get_user_by_credentials, get_user_request, request_switch_status, get_knowledge_solutions, get_users_with_active_requests, save_request_message, get_request_chat_history
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
init_db()

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
    request_category = request.form.get("category") # Здесь можно добавить логику для генерации кода запроса

    create_request(user[0], request_title, request_text, request_category)
    return redirect(url_for("user_panel"))


## РОУТЫ

@app.route("/api/user_requests/<int:user_id>")
@login_required()
def get_requests_api(user_id,user):
    if user[4] != "admin" and user[0] != user_id:
        return jsonify({"error": "forbidden"}), 403
    user_requests = get_user_request(user_id) 
    return jsonify(user_requests)


@app.route("/api/request_switch/<int:request_id>/<new_status>")
@login_required(role="admin")
def request_switch(request_id, new_status, user):
    request_switch_status(request_id, new_status)
    return jsonify({"status": "success", "message": "Статус успешно обновлен"})
    


@app.route("/api/get_solution/<category>")
def get_solution_api(category):
    solutions_list = get_knowledge_solutions(category) # Вызывает функцию с fetchall()
    if solutions_list:
        return jsonify({"status": "success", "data": solutions_list})
    return jsonify({"status": "not_found"})


@app.route("/api/get_chat/<int:request_id>")
def get_chat(request_id):
    history = get_request_chat_history(request_id)
    return jsonify({"status": "success", "history": history})


@app.route("/api/send_chat_message", methods=["POST"])
@login_required()               # ???
def send_chat_message(user):
    data = request.json # Принимаем JSON от JavaScript
    request_id = data.get("request_id") #получает от джейсон даты ид запроса
    message_text = (data.get("text") or "").strip() # получаем текст сообщения из джейсона или если его нет оставляем пустым, удаляем пробелы с начала и конца

    if not message_text: 
        return jsonify({"error": "empty message"}), 400

    id_sender = user[0]                #получаем юзера и роль из сессии
    sender_role = user[4]

    con = connect_db()
    cur = con.cursor()
    cur.execute("SELECT user_id FROM requests WHERE id = ?", (request_id,)) # получаем пользователя который отправил заявку
    row = cur.fetchone()
    con.close()

    if not row:
        return jsonify({"error": "request not found"}), 404 # если его нет отправляем ошибку

    request_owner_id = row[0]
    print(request_owner_id != id_sender)
    print(request_owner_id , id_sender)

    if sender_role != "admin" and id_sender != request_owner_id: # проверяем доступ
        return jsonify({"error": "forbidden"}), 403
    

    if sender_role == "admin": # если отправитель админ, тогда отправяляем хосту заявки 
        id_reciev = request_owner_id
    else:
        # пользователь пишет админу — берём первого админа (упрощённо)
        con = connect_db()
        cur = con.cursor()
        cur.execute("SELECT id FROM accounts WHERE user_role = 'admin' LIMIT 1") #берем первого же админа
        adm = cur.fetchone()
        con.close()
        id_reciev = adm[0] if adm else 0

    
    save_request_message(request_id, id_sender, id_reciev, message_text) # заполняем базу данными 
    return jsonify({"status": "success"})



## РЕГИСТРАЦИЯ, ЛОГИН, ЛОГАУТ


@app.route("/register", methods=["POST"])
def register_user():

    login = request.form.get("login")
    name = request.form.get("user_name")
    room = request.form.get("room")
    user_ip = request.remote_addr
    user_token = str(uuid.uuid4())
    user_role = request.form.get("user_role")
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
    response = make_response(redirect(url_for('admin_panel' if user_role == 'admin' else 'user_panel')))
    response.set_cookie("user_token", user_token, max_age=60*60*24*365)
    
    return response


@app.route("/login", methods=["POST"])
def login_user():
    login = request.form.get("login")
    password = request.form.get("password")
    
    con = connect_db()
    cur = con.cursor()
    cur.execute("SELECT * FROM accounts WHERE login = ?", (login,))
    user = cur.fetchone()
    con.close()

    if not user or not check_password_hash(user[6], password):  # user[6] = password
        return make_response("Неправильный логин или пароль", 401)

    user_token = str(uuid.uuid4())
    con = connect_db()
    cur = con.cursor()
    cur.execute("UPDATE accounts SET token = ? WHERE id = ?", (user_token, user[0]))
    con.commit()
    con.close()

    response = make_response(redirect(url_for('admin_panel' if user[4] == 'admin' else 'user_panel')))
    response.set_cookie("user_token", user_token, max_age=60*60*24*365)
    return response


@app.route("/logout")
def logout():
    
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
    user_requests = get_user_request(user_id)

    return render_template("start_page_user.html", requests=user_requests, user_id = user_id)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)