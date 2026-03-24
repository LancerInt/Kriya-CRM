import base64


def encrypt_value(plaintext):
    if not plaintext:
        return ''
    return base64.b64encode(plaintext.encode()).decode()


def decrypt_value(ciphertext):
    if not ciphertext:
        return ''
    return base64.b64decode(ciphertext.encode()).decode()
