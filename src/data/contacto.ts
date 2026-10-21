// TODO: confirmar datos oficiales (el teléfono es el del sitio actual, parece provisorio).
import { conBase } from '../lib/rutas';

export const contacto = {
  ciudad: 'Asunción, Paraguay',
  email: 'contacto@ippse.org.py',
  telefono: '+595 21 000 000',
};

/** Botón "Unirse": abre el formulario de contacto con la pestaña de membresía seleccionada. */
export const enlaceMembresia = conBase('/contacto/?tipo=membresia#formulario');

// TODO: reemplazar por la URL real del canal de WhatsApp del IPPSE.
/** Canal de WhatsApp: difusión de informes y participación ciudadana. */
export const canalWhatsApp = 'https://whatsapp.com/channel/000000000000000';

/** Script PHP de cPanel que recibe el formulario (ver public/enviar.php). */
export const accionFormulario = conBase('/enviar.php');
