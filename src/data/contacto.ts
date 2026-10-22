// Datos de contacto del IPPSE — FUENTE ÚNICA.
//
// Para cambiar el email, el teléfono o el WhatsApp NO hace falta tocar las páginas:
// basta con editar estos valores (o definirlos por variables de entorno en un archivo
// .env, que no se sube al repositorio). Ver .env.example.
//
// Variables de entorno reconocidas (todas opcionales):
//   PUBLIC_IPPSE_EMAIL          -> correo institucional
//   PUBLIC_IPPSE_TELEFONO       -> teléfono tal como se muestra (ej. "+595 21 123 456")
//   PUBLIC_IPPSE_CIUDAD         -> ciudad (ej. "Asunción, Paraguay")
//   PUBLIC_IPPSE_WHATSAPP       -> URL completa del canal de WhatsApp
//
// Las variables PUBLIC_* quedan disponibles tanto en el servidor (build) como en el
// cliente, por lo que se usan para que el mismo valor sirva en todo el sitio.

import { conBase } from '../lib/rutas';

const env = import.meta.env;

/** Valor de entorno o, si no está definido, el valor por defecto del repositorio. */
const o = (valor: string | undefined, porDefecto: string): string =>
  valor && valor.trim() !== '' ? valor.trim() : porDefecto;

export const contacto = {
  ciudad: o(env.PUBLIC_IPPSE_CIUDAD, 'Asunción, Paraguay'),
  email: o(env.PUBLIC_IPPSE_EMAIL, 'contacto@ippse.org.py'),
  /** Teléfono tal como se muestra en pantalla. */
  telefono: o(env.PUBLIC_IPPSE_TELEFONO, '+595 21 000 000'),
};

/** Teléfono listo para un enlace tel: (sin espacios ni guiones). */
export const telefonoEnlace = contacto.telefono.replace(/[\s()-]/g, '');

/** Botón "Unirse": abre el formulario de contacto con la pestaña de membresía seleccionada. */
export const enlaceMembresia = conBase('/contacto/?tipo=membresia#formulario');

/** Canal de WhatsApp: difusión de informes y participación ciudadana. */
export const canalWhatsApp = o(
  env.PUBLIC_IPPSE_WHATSAPP,
  'https://whatsapp.com/channel/000000000000000',
);

/** Script PHP de cPanel que recibe el formulario (ver public/enviar.php). */
export const accionFormulario = conBase('/enviar.php');
