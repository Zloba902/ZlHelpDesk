
import uuid


from flask import Flask, request, make_response, redirect, url_for
from flask import render_template
from flask import jsonify
from database import connect_db, init_db, create_user, get_user_by_token, update_ip_user, create_request, get_user_by_credentials, get_user_request, request_switch_status




app = Flask(__name__)
init_db()
print(get_user_request(3))

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
    request_code = "200"  # Здесь можно добавить логику для генерации кода запроса

    create_request(user[0], request_title, request_text, request_code)
    return redirect(url_for("user_panel"))




@app.route("/api/user_requests/<int:user_id>")
def get_requests_api(user_id):
    # Дополнительно: здесь можно проверить user_token на права админа,
    # если это закрытая админ-панель
    
    # Вызываем твою функцию получения списка словарей из БД
    user_requests = get_user_request(user_id) 
    
    # Возвращаем данные клиенту в формате JSON
    return jsonify(user_requests)

@app.route("/api/request_switch/<int:request_id>/<new_status>")
def request_switch(request_id, new_status):
    request_switch_status(request_id, new_status)
    return jsonify({"status": "success", "message": "Статус успешно обновлен"})
    


## РЕГИСТРАЦИЯ, ЛОГИН, ЛОГАУТ




@app.route("/register", methods=["POST"])
def register_user():
    name = request.form.get("user_name")
    room = request.form.get("room")
    user_ip = request.remote_addr
    user_token = str(uuid.uuid4())
    user_role = request.form.get("user_role")
    password = request.form.get("password")

    create_user(user_token, user_ip, user_role ,name, password ,room)
    response = make_response(redirect(url_for('admin_panel' if user_role == 'admin' else 'user_panel')))
    response.set_cookie("user_token", user_token, max_age=60*60*24*365)
    
    return response

@app.route("/login", methods=["POST"])
def login_user():
    user_name = request.form.get("user_name")
    password = request.form.get("password")
    print("Проверка" ,user_name, password)
    
    user = get_user_by_credentials(user_name, password)
    user_token = str(uuid.uuid4())
    print("DEBUG user =", user)

    if user:
        response = make_response(redirect(url_for('admin_panel' if user[3] == 'admin' else 'user_panel')))
        response.set_cookie("user_token", user_token, max_age=60*60*24*365)
        con = connect_db()
        cur = con.cursor()
        # Предполагаем, что первое поле (user[0]) — это id или имя пользователя
        cur.execute('UPDATE accounts SET token = ? WHERE user_name = ?', (user_token, user_name))
        con.commit()
        con.close()
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
    if not user or user[3] != "admin":
        return redirect(url_for("home"))

    return render_template("start_page_admin.html", devices=registered_devices(), name = user[4])


@app.route("/user")
def user_panel():
    user_token = request.cookies.get("user_token")
    user = get_user_by_token(user_token)
    if not user:
        return redirect(url_for("home"))

    user_ip = request.remote_addr

    update_ip_user(user_token, user_ip)

    return render_template("start_page_user.html")
    return make_response("Неверное имя пользователя или пароль", 401)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)