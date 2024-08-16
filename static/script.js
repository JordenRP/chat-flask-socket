const chatWindow = document.getElementById('chat-window');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');

let ws;
let sessionID = null;
let hexKey = null;


async function importKeyFromHex(hexKey) {
    const keyBuffer = hexToArrayBuffer(hexKey);

    return await window.crypto.subtle.importKey(
        "raw",
        keyBuffer,
        {name: "AES-CBC"},
        false,
        ["decrypt", "encrypt"]
    );
}

function generateIv() {
    return window.crypto.getRandomValues(new Uint8Array(16));
}

async function encryptMessage(message, hexKey) {
    const key = await importKeyFromHex(hexKey);
    const iv = generateIv();
    const encoder = new TextEncoder();
    const data = encoder.encode(message);

    const encryptedData = await window.crypto.subtle.encrypt(
        {
            name: "AES-CBC",
            iv: iv
        },
        key,
        data
    );

    const combined = new Uint8Array(iv.byteLength + encryptedData.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encryptedData), iv.byteLength);

    return combined.buffer;
}

function hexToArrayBuffer(hex) {
    const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    return bytes.buffer;
}

async function decryptMessage(encryptedData, hexKey, iv) {
    const key = await importKeyFromHex(hexKey);

    try {
        const decrypted = await window.crypto.subtle.decrypt(
            {
                name: "AES-CBC",
                iv: iv
            },
            key,
            encryptedData
        );

        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    } catch (err) {
        console.error("Ошибка при расшифровке:", err);
    }
}

function blobToArrayBuffer(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function() {
            resolve(reader.result);
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(blob);
    });
}

async function handleEncryptedMessage(event, hexKey) {
    const blob = event.data;

    const arrayBuffer = await blobToArrayBuffer(blob);

    let encryptedData = new Uint8Array(arrayBuffer);

    const prefix = "ENCRYPTED:";
    const prefixBytes = new TextEncoder().encode(prefix);
    if (encryptedData.slice(0, prefixBytes.length).toString() === prefixBytes.toString()) {
        encryptedData = encryptedData.slice(prefixBytes.length);

        const iv = encryptedData.slice(0, 16);
        const data = encryptedData.slice(16);

        return await decryptMessage(data, hexKey, iv);
    } else {
        console.error("Сообщение не содержит префикса 'ENCRYPTED:'");
    }
}

function addMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.textContent = message;
    chatWindow.appendChild(messageElement);
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

function connectToServer() {
    ws = new WebSocket('ws://localhost:5000');

    ws.onopen = () => {
        addMessage('Connected to the server.');
    };

    ws.onmessage = (event) => {
        if (!hexKey) {
            hexKey = event.data;

            return;
        }

        if (!sessionID) {
            sessionID = event.data;
            addMessage(`Your Chat ID: ${sessionID}`);
        } else {
            if (event.data instanceof Blob) {
                handleEncryptedMessage(event, hexKey)
                    .then(decryptedMessage => {
                        if (decryptedMessage) {
                            addMessage(decryptedMessage);
                        }
                    })
                    .catch(err => {
                        console.error("Ошибка при обработке зашифрованного сообщения:", err);
                    });

                return;
            }

            addMessage(event.data);
        }
    };

    ws.onclose = () => {
        addMessage('Disconnected from the server.');
    };

    ws.onerror = (error) => {
        addMessage('Error: ' + error.message);
    };
}

sendBtn.addEventListener('click', () => {
    const message = chatInput.value;
    if (message.trim() && ws.readyState === WebSocket.OPEN) {
        if (message.startsWith("/msg ")) {
             encryptMessage(message, hexKey).
                then(encryptedBuffer => {
                 if (encryptedBuffer) {
                     const encryptedMessage = btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));

                     ws.send(`ENCRYPTED:${encryptedMessage}`);
                 }
             });
        } else {
            ws.send(message);
        }
    }

    chatInput.value = '';
});

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendBtn.click();
    }
});

window.addEventListener('load', () => {
    connectToServer();
});
