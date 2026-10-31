var nowQuizPos = 0;
var qdata = null;

function initializeQuiz() {
    const body = document.querySelector("main");
    const rootDomDealer = new Deal(body);

    rootDomDealer.CE("div", { id: "header", styles: { height: "8vh", margin: "0", padding: "0", "background-color": "#333333" } })
    rootDomDealer.CE("div", { id: "block", styles: { display: "flex", height: "92vh", "box-sizing": "border-box", margin: "0", padding: "0", "background-color": "black" } })
    rootDomDealer.CCE("#block", "div", { id: "leftblock", styles: { width: "50%", height: "100%", "background-color": "black" } });
    rootDomDealer.CCE("#block", "div", { id: "rightblock", styles: { width: "50%", height: "100%", "box-sizing": "border-box", "background-color": "black", padding: "40px 20px 80px 20px" } });
    rootDomDealer.CCE("#block|#rightblock", "div", { id: "rightcontent", styles: { display: "flex", "flex-direction": "column", height: "100%", "box-sizing": "border-box", border: "solid 5px #333333", "border-radius": "15px", "background-color": "#000000" } })
    function startQuiz(data) {
        qdata = data;
        rootDomDealer.CCE("#header", "p", { text: data.name, styles: { color: "white", "font-size": "100%", margin: "0" } })
        createQuizUI();
    }

    function createQuizUI() {
        const data = qdata.content[nowQuizPos];
        if (!data) {
            return;
        }
        console.log(data);
        const questionDealer = new Deal(document.getElementById("leftblock"));
        const answerDealer = new Deal(document.getElementById("rightcontent"));
        questionDealer.DELETE();
        answerDealer.DELETE();
        const SentenceElement = questionDealer.CE("p", { text: data.sentence, styles: { color: "white", "font-size": "150%", margin: "15px" } });
        SentenceElement.innerHTML = data.sentence.replace(/\n/g, "<br>");

        let USERANSWERS = [];
        let currentInput = null;

        if (data.type === "option1" || data.type === "option2") {
            answerDealer.CE("div", { id: "options", styles: { width: "100%", display: "flex", "flex-wrap": "wrap", "justify-content": "center", "align-items": "flex-start", "flex-direction": "column" } });
            data.options.forEach((answer, index) => {
                const D = answerDealer.CCE("#options", "button", { text: answer, class: "unselected", styles: { color: "white", "font-size": "100%", margin: "15px", padding: "10px 20px", "background-color": "#333333", "border-radius": "5px", cursor: "pointer", width: "fit-content", "min-width": "100px" }, attrs: { id: `answer${index}` } });
                if (currentInput === null) {
                    currentInput = D;
                };
                D.addEventListener("keydown", (event) => {
                    event.preventDefault();
                    if (event.key === "Enter") {
                        const answerButton = document.getElementById(`answer${index}`);
                        answerButton.click();
                    };
                    if (event.key === "ArrowDown") {//最後ならばsubmitボタンにフォーカスを移す
                        const nextIndex = (index + 1) % data.options.length;
                        if (nextIndex === 0) {
                            const submitButton = document.getElementById("submit");
                            submitButton.focus();
                        } else {
                            const nextButton = document.getElementById(`answer${nextIndex}`);
                            nextButton.focus();
                        }
                    };
                    if (event.key === "ArrowUp") {
                        const prevIndex = (index - 1 + data.options.length) % data.options.length;
                        const prevButton = document.getElementById(`answer${prevIndex}`);
                        prevButton.focus();
                    };
                });
                const answerButton = document.getElementById(`answer${index}`);
                answerButton.addEventListener("click", () => {
                    if (answerButton.classList.contains("unselected")) {
                        if (data.type === "option1") {
                            data.options.forEach((otherAnswer, otherIndex) => {
                                if (otherIndex !== index) {
                                    const otherButton = document.getElementById(`answer${otherIndex}`);
                                    otherButton.classList.remove("selected");
                                    otherButton.classList.add("unselected");
                                    USERANSWERS = USERANSWERS.filter(a => a !== otherAnswer);
                                }
                            });
                        }
                        answerButton.classList.remove("unselected");
                        answerButton.classList.add("selected");
                        USERANSWERS.push(answer);
                        console.log(`User selected: ${USERANSWERS[USERANSWERS.length - 1]}`);
                    } else {
                        answerButton.classList.remove("selected");
                        answerButton.classList.add("unselected");
                        USERANSWERS = USERANSWERS.filter(a => a !== answer);
                        console.log(`User deselected: ${answer}`);
                    }
                });
            });
        } else if (data.type === "Tinput" || data.type === "Ninput") {
            const isNumberInput = data.type === "Ninput";
            const input = answerDealer.CE("input", {
                attrs: {
                    type: isNumberInput ? "number" : "text",
                    placeholder: isNumberInput ? "\u6570\u5b57\u3092\u5165\u529b" : "\u56de\u7b54\u3092\u5165\u529b",
                    value: ""
                },
                styles: {
                    color: "white",
                    "font-size": "100%",
                    margin: "15px 0",
                    padding: "10px 12px",
                    "background-color": "#111111",
                    "border": "1px solid #666666",
                    "border-radius": "5px",
                    width: "calc(100% - 30px)"
                }
            });
            currentInput = input;
            currentInput.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    submitButton.click();
                }
            });
            currentInput.addEventListener("keydown", (event) => {
                if (event.key === "ArrowDown") {
                    const submitButton = document.getElementById("submit");
                    submitButton.focus();
                }
            });
            input.addEventListener("input", () => {
                USERANSWERS = [input.value];
            });
        }

        console.log(currentInput);

        currentInput.focus();

        const submitButton = answerDealer.CE("button", {
            id: "submit",
            text: "Submit",
            styles: {
                color: "white",
                "font-size": "100%",
                margin: "15px",
                "margin-top": "auto",
                padding: "10px 20px",
                "background-color": "#333333",
                "border-radius": "5px",
                cursor: "pointer"
            }
        });

        submitButton.addEventListener("keydown", (event) => {
            event.preventDefault();
            if (data.type === "option1" || data.type === "option2") {
                if (event.key === "ArrowUp") {
                    const lastIndex = data.options.length - 1;
                    const lastButton = document.getElementById(`answer${lastIndex}`);
                    lastButton.focus();
                }
            } else if (data.type === "Tinput" || data.type === "Ninput") {
                if (event.key === "ArrowUp") {
                    currentInput.focus();
                }
            }
            if (event.key === "Enter") {
                submitButton.click();
            }
        });

        submitButton.addEventListener("click", () => {
            if (submitButton.textContent === "Submit") {
                const normalizeText = (value) => String(value ?? "").trim();
                const normalizeAnswers = (answers) => [...answers].map(String).sort();
                const isCorrect = (() => {
                    if (data.type === "Tinput" || data.type === "Ninput") {
                        const inputValue = normalizeText(currentInput ? currentInput.value : "");
                        const expected = Array.isArray(data.answer) ? data.answer : [data.answer];
                        if (data.type === "Ninput") {
                            const userNumber = Number(inputValue);
                            return expected.some(value => Number(value) === userNumber);
                        }
                        return expected.some(value => normalizeText(value) === inputValue);
                    }

                    const selected = normalizeAnswers(USERANSWERS);
                    const correct = normalizeAnswers(data.answer || []);
                    return selected.length === correct.length && selected.every((value, index) => value === correct[index]);
                })();

                submitButton.textContent = "Next";
                if (isCorrect) {
                    alert("Correct!");
                } else {
                    alert("Incorrect!");
                }
            } else {
                nowQuizPos++;
                if (nowQuizPos < qdata.content.length) {
                    createQuizUI();
                } else {
                    alert("Quiz finished!");
                }
            }
        });
    }

    function getquizdata() {
        return fetch("/qs/qsData/1.json", {
            cache: "no-store"
        }).then(
            res => res.json()
        ).then(
            data => {
                console.log(data);
                return data;
            }
        ).catch(error => {
            console.error('Error:', error);
        })
    }

    getquizdata().then(data => startQuiz(data));
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeQuiz);
} else {
    initializeQuiz();
}