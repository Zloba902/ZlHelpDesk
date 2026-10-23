
const openBtn = document.getElementById('openPanelBtn');
const closeBtn = document.getElementById('closePanelBtn');
const panel = document.getElementById('infoPanel');

// Открыть панель по клике на верхнюю левую кнопку
openBtn.addEventListener('click', () => {
    panel.classList.add('active');
    panel2.classList.remove('active');
});

// Закрыть панель
closeBtn.addEventListener('click', () => {
    panel.classList.remove('active');
});




const openBtn2 = document.getElementById('openPanelBtn2');
const closeBtn2 = document.getElementById('closePanelBtn2');
const panel2 = document.getElementById('Panelrequests');

// Открыть панель по клике на верхнюю левую кнопку
openBtn2.addEventListener('click', () => {
    panel2.classList.add('active');
    panel.classList.remove('active');
});

// Закрыть панель
closeBtn2.addEventListener('click', () => {
    panel2.classList.remove('active');
});



document.getElementById('category-select').addEventListener('change', function () {
    const category = this.value;
    const solutionBox = document.getElementById('solution-box');

    // Если пользователь сбросил выбор на "Выберите проблему", прячем блок
    if (!category) {
        solutionBox.classList.remove('active')
        
        return;
    } else {
        solutionBox.classList.add('active')
    }
       
    // Запрашиваем решение у Flask
    fetch(`/api/get_solution/${category}`)
        .then(response => response.json())


        .then(res => {
            if (res.status === 'success') {
                // Заполняем блок текстом из базы данных и плавно показываем
                solutionBox.innerHTML = '<div> </div>'
                solutionBox.style.display = 'block';


                res.data.forEach((req) => {
                    const solCard = document.createElement('div');
                    solCard.className = 'solotion';

                    solCard.innerHTML = `
                    <h4>#${req.title}</h4>
                    <p>Текст: ${req.solution}</p>
                `;
                    solutionBox.appendChild(solCard);
                });


            } else {
                // Если для этой категории нет подсказки в базе знаний
                solutionBox.style.display = 'none';
            }


        })
        .catch(err => {
            console.error('Ошибка базы знаний:', err);
            solutionBox.style.display = 'none';
        });
});

