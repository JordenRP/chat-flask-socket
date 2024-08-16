import asyncio
import websockets
import uuid
import os
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import padding
import base64

chats = {}
key = "3d2f8c5b2e9f3a2d7d4a0b8f7a6c5e1f2b4c7d9f0e8b7a3c6d5f9e8b4c3a2b1"

def decrypt_message(encrypted_message, key):
    iv = encrypted_message[:16]

    encrypted_data = encrypted_message[16:]

    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    decryptor = cipher.decryptor()

    padded_data = decryptor.update(encrypted_data) + decryptor.finalize()

    unpadder = padding.PKCS7(algorithms.AES.block_size).unpadder()  # Инициализация unpadder
    data = unpadder.update(padded_data) + unpadder.finalize()

    return data.decode('utf-8')

def encrypt_message(message, key):
    iv = os.urandom(16)
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    encryptor = cipher.encryptor()

    padder = padding.PKCS7(algorithms.AES.block_size).padder()
    padded_data = padder.update(message.encode()) + padder.finalize()

    encrypted_message = encryptor.update(padded_data) + encryptor.finalize()
    return iv + encrypted_message

async def handle_connection(websocket, path):
    key = bytes.fromhex("06832ce498f8c8210aa7c83a7f2e6f29102926bd9a1e4cacdcea961537247377")
    await websocket.send(key.hex())

    user_session_id = str(uuid.uuid4())
    await websocket.send(user_session_id)
    current_chat_id = None
    username = None
    if user_session_id not in chats:
        chats[user_session_id] = {}
    current_chat_id = user_session_id

    async for message in websocket:
        if message.startswith("ENCRYPTED:"):
            encrypted_message = base64.b64decode(message[10:])
            message = decrypt_message(encrypted_message, key)

            print(message, flush=True)

        if message.startswith("/join "):
            new_chat_id = message.split(" ")[1]
            if new_chat_id not in chats:
                chats[new_chat_id] = {}
            current_chat_id = new_chat_id
            if username != None:
                chats[current_chat_id][username] = websocket
            await websocket.send(f"Вы присоединились к чату {current_chat_id}")

        elif message.startswith("/name "):
            if current_chat_id is None:
                await websocket.send("Сначала присоединитесь к чату через /join <chat_id>")
            else:
                new_username = message.split(" ")[1]
                if new_username in chats[current_chat_id]:
                    await websocket.send("Это имя уже занято. Попробуйте другое.")
                else:
                    if username in chats[current_chat_id]:
                        del chats[current_chat_id][username]
                    username = new_username
                    chats[current_chat_id][username] = websocket
                    await websocket.send(f"Ваше имя установлено как {username}")

        elif message.startswith("/msg "):
            if current_chat_id is None:
                await websocket.send("Сначала присоединитесь к чату через /join <chat_id>")
            elif username is None:
                await websocket.send("Сначала установите имя через /name <your_name>")
            else:
                broadcast_message = f"{username}: {message.split(' ', 1)[1]}"
                encrypted_message = encrypt_message(broadcast_message, key)
                prefixed_message = b"ENCRYPTED:" + encrypted_message
                for user, user_ws in chats[current_chat_id].items():
                    await user_ws.send(prefixed_message)
        else:
            await websocket.send("Установите/Смените имя через /name <your_name>")
            await websocket.send("Присоединитесь к чату через /join <chat_id>")
            await websocket.send("Отправите сообщения через /msg <message>")



async def main():
    async with websockets.serve(handle_connection, "0.0.0.0", 5000):
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
