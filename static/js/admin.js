function loadRequests(userId, userName) {
    const requestsTitle = document.getElementById("requests-title");
    const requestsList = document.getElementById("requests-list");

    requestsTitle.innerText = `Заявки пользователя: ${userName}`;

    fetch(`/api/user_requests/${userId}`)
        .then((response) => {
            if (!response.ok) {
                throw new Error("Ошибка при загрузке данных с сервера");
            }

            return response.json();
        })
        .then((requests) => {
            requestsList.innerHTML = "";

            if (requests.length === 0) {
                requestsList.innerHTML =
                    '<p style="color: gray;">У этого пользователя нет активных заявок.</p>';
                return;
            }

            requests.forEach((req) => {
                const reqCard = document.createElement('div');
                reqCard.className = 'request';

                reqCard.innerHTML = `
                    <h4>#${req.id}: ${req.title}</h4>
                    <p class = "code"> Код ошибки: ${req.code || "нет"}</p>
                    <p>Текст: ${req.request_text}</p>
                    <div class="dropdown">
                    <button class="dropbtn" id= "status">Статус: <span class="status-badge">${req.status}</span></button>
                    <i class="fa fa-caret-down"></i>
                    <div class="dropdown-content">
                            <button onclick="switch_status('${req.id}', 'В обработке', '${userId}', '${userName}')">В обработке</button>
                            <button onclick="switch_status('${req.id}', 'В процессе', '${userId}', '${userName}')">В процессе</button>
                            <button onclick="switch_status('${req.id}', 'Готово', '${userId}', '${userName}')">Готово</button>
                        </div>
                    </div>
                    

                    
                        
                `;
                

                requestsList.appendChild(reqCard);
            });
        })
        .catch((error) => {
            console.error("Ошибка fetch:", error);
            requestsList.innerHTML =
                '<p style="color: red;">Не удалось загрузить заявки.</p>';
        });
        
}


function switch_status(request_id, new_status, user_id, user_name) {
    fetch(`/api/request_switch/${request_id}/${new_status}`)
        .then(data => {
            console.log(data.message);
            loadRequests(user_id, user_name);
        })
    
}

