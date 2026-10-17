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
                const reqCard = document.createElement("div");
                reqCard.className = "user_request";
                reqCard.style.border = "1px solid #ccc";
                reqCard.style.padding = "10px";
                reqCard.style.marginBottom = "10px";
                reqCard.style.borderRadius = "5px";

                reqCard.innerHTML = `
                    <h4><strong>#${req.id}</strong>: ${req.title}</h4>
                    <p><strong>Текст:</strong> ${req.request_text}</p>
                    <p><strong>Код ошибки:</strong> <code>${req.code || "нет"}</code></p>
                    <p id="request_status">Статус: <span class="status-badge">${req.status}</span></p>
                    
                    <div class="dropdown">
                    <button class="dropbtn">Статус: 
                    <i class="fa fa-caret-down"></i>
                    </button>
                         <div class="dropdown-content">
                            <button onclick="switch_status('${req.id}', 'В обработке', '${userId}', '${userName}')">В обработке</button>
                            <button onclick="switch_status('${req.id}', 'В обработке', '${userId}', '${userName}')">В обработке</button>
                            <button onclick="switch_status('${req.id}', 'В обработке', '${userId}', '${userName}')">В обработке</button>
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