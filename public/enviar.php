<?php
/**
 * Procesa el formulario de /contacto/ en cPanel (PHP estándar, sin dependencias).
 * Envía el mensaje por correo y redirige de vuelta con ?enviado=1 o ?error=1.
 */

// TODO: confirmar el buzón que recibe los mensajes y un remitente del propio dominio (requerido por SPF/DKIM).
const DESTINO = 'contacto@ippse.org.py';
const REMITENTE = 'web@ippse.org.py';

function volver(string $estado, string $tipo = 'consulta'): void {
    $consulta = $tipo === 'membresia' ? "tipo=membresia&$estado=1" : "$estado=1";
    header("Location: /contacto/?$consulta#formulario", true, 303);
    exit;
}

function limpiar(string $clave, int $max): string {
    $valor = trim((string) ($_POST[$clave] ?? ''));
    // Sin saltos de línea en campos de una línea: evita inyección de cabeceras
    if ($clave !== 'mensaje') $valor = preg_replace('/[\r\n]+/', ' ', $valor);
    return mb_substr($valor, 0, $max);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') volver('error');

$tipo = ($_POST['tipo'] ?? '') === 'membresia' ? 'membresia' : 'consulta';

// Trampa anti-spam: si viene completa, se finge éxito y no se envía nada
if (!empty($_POST['sitio_web'])) volver('enviado', $tipo);

$nombre = limpiar('nombre', 120);
$email = limpiar('email', 160);
$especialidad = limpiar('especialidad', 160);
$mensaje = limpiar('mensaje', 5000);

if ($nombre === '' || $mensaje === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) volver('error', $tipo);
if ($tipo === 'membresia' && $especialidad === '') volver('error', $tipo);

$asunto = $tipo === 'membresia' ? 'Solicitud de membresía' : 'Consulta general';
$cuerpo = "Tipo: $asunto\nNombre: $nombre\nEmail: $email\n";
if ($tipo === 'membresia') $cuerpo .= "Especialidad / Área: $especialidad\n";
$cuerpo .= "\nMensaje:\n$mensaje\n";

$cabeceras = implode("\r\n", [
    'From: IPPSE Web <' . REMITENTE . '>',
    'Reply-To: ' . $email,
    'Content-Type: text/plain; charset=UTF-8',
]);

$ok = mail(DESTINO, '=?UTF-8?B?' . base64_encode("[Web IPPSE] $asunto — $nombre") . '?=', $cuerpo, $cabeceras);
volver($ok ? 'enviado' : 'error', $tipo);
