/**
 * Panel emergente de con§tel (el formulario del § y el detalle de un §).
 *
 * Se descarta con Escape y con activación fuera; retiene el foco mientras
 * está abierto y lo devuelve a quien lo abrió; se ubica dentro del viewport.
 * Se arrastra tomándolo por cualquier zona que no sea un control; una vez
 * movido por el lector, deja de reubicarse solo. Se redimensiona desde la
 * esquina inferior derecha (sólo esa vez: cada panel nace con su tamaño).
 *
 * Posición de llamado: a la derecha del bloque del texto (párrafo, ítem,
 * celda), sin taparlo, alineado con el inicio del § (opts.anchor).
 * Lleva la clase constel-ui: queda fuera del texto canónico.
 */
let current = null;

/**
 * @param {Object} opts
 * @param {string} opts.label nombre accesible del diálogo
 * @param {DOMRect} opts.near rectángulo de referencia (viewport)
 * @param {Element|null} [opts.returnFocus]
 * @param {Element|Range} [opts.anchor] el texto al que se refiere: el panel
 *  se pone a su derecha
 * @return {{el: HTMLElement, body: HTMLElement, close: Function}}
 */
function open( opts ) {
	close();
	const el = document.createElement( 'div' );
	el.className = 'constel-ui constel-panel';
	el.setAttribute( 'role', 'dialog' );
	el.setAttribute( 'aria-label', opts.label );

	const closeButton = require( './icons.js' ).iconButton(
		'x', mw.msg( 'constel-panel-close' ), 'constel-panel__close'
	);
	closeButton.addEventListener( 'click', () => close() );

	const body = document.createElement( 'div' );
	body.className = 'constel-panel__body';
	el.append( closeButton, body );
	document.body.appendChild( el );

	const onKey = ( e ) => {
		if ( e.key === 'Escape' ) {
			e.preventDefault();
			close();
		} else if ( e.key === 'Tab' ) {
			trapFocus( el, e );
		}
	};
	const onOutside = ( e ) => {
		if ( !el.contains( e.target ) ) {
			close();
		}
	};
	el.addEventListener( 'keydown', onKey );
	// En el siguiente ciclo, para no cerrarse con el mismo clic que lo abrió.
	setTimeout( () => document.addEventListener( 'mousedown', onOutside ) );
	const markMoved = () => {
		if ( current ) {
			current.moved = true;
		}
	};
	const stopDrag = draggable( el, markMoved );
	resizable( el, markMoved );

	current = {
		el,
		body,
		moved: false,
		anchor: opts.anchor || null,
		close: () => {
			document.removeEventListener( 'mousedown', onOutside );
			stopDrag();
			el.remove();
			current = null;
			if ( opts.returnFocus && document.contains( opts.returnFocus ) ) {
				opts.returnFocus.focus();
			}
		}
	};
	position( el, opts.near, current.anchor );
	return current;
}

/* Zona de la esquina que es del agarre de redimensionar (px). */
const GRIP = 18;

/**
 * @param {HTMLElement} el
 * @param {PointerEvent} e
 * @return {boolean} el puntero está en el agarre de redimensionar
 */
function onGrip( el, e ) {
	const r = el.getBoundingClientRect();
	return e.clientX > r.right - GRIP && e.clientY > r.bottom - GRIP;
}

/**
 * Redimensionar es nativo (CSS resize); aquí sólo se fija el alto de partida
 * para que quitar el tope no lo haga saltar. Con tamaño elegido, la glosa
 * ocupa el alto sobrante (ui.css: .constel-panel--sized).
 *
 * @param {HTMLElement} el
 * @param {Function} onResize se llama si el tamaño cambió
 */
function resizable( el, onResize ) {
	el.addEventListener( 'pointerdown', ( e ) => {
		if ( e.button !== 0 || !onGrip( el, e ) ) {
			return;
		}
		const before = { w: el.offsetWidth, h: el.offsetHeight };
		el.style.width = before.w + 'px';
		el.style.height = before.h + 'px';
		el.classList.add( 'constel-panel--sized' );
		document.addEventListener( 'pointerup', () => {
			const after = { w: el.offsetWidth, h: el.offsetHeight };
			if ( after.w !== before.w || after.h !== before.h ) {
				onResize();
			}
		}, { once: true } );
	} );
}

/* Lo que se toma para escribir o elegir no inicia un arrastre. */
const NO_DRAG = 'input, textarea, select, button, a, label, [contenteditable], ' +
	'[role="option"], [role="listbox"], [tabindex]';

/**
 * Arrastre con puntero (ratón, lápiz o dedo), acotado al viewport.
 *
 * @param {HTMLElement} el
 * @param {Function} onMove se llama al primer desplazamiento
 * @return {Function} desinstala los manejadores globales en curso
 */
function draggable( el, onMove ) {
	let drag = null;
	const move = ( e ) => {
		const margin = 8;
		const x = Math.min(
			Math.max( margin, e.clientX - drag.dx ),
			window.innerWidth - el.offsetWidth - margin
		);
		const y = Math.min(
			Math.max( margin, e.clientY - drag.dy ),
			window.innerHeight - Math.min( el.offsetHeight, 48 ) - margin
		);
		el.style.left = ( Math.max( margin, x ) + window.scrollX ) + 'px';
		el.style.top = ( y + window.scrollY ) + 'px';
		onMove();
	};
	const end = () => {
		if ( drag ) {
			el.classList.remove( 'constel-panel--dragging' );
			document.removeEventListener( 'pointermove', move );
			document.removeEventListener( 'pointerup', end );
			document.removeEventListener( 'pointercancel', end );
			drag = null;
		}
	};
	el.addEventListener( 'pointerdown', ( e ) => {
		if ( e.button !== 0 || e.target.closest( NO_DRAG ) || onGrip( el, e ) ) {
			return;
		}
		const r = el.getBoundingClientRect();
		drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
		el.classList.add( 'constel-panel--dragging' );
		// Sin esto, arrastrar selecciona texto del panel o de la página.
		e.preventDefault();
		document.addEventListener( 'pointermove', move );
		document.addEventListener( 'pointerup', end );
		document.addEventListener( 'pointercancel', end );
	} );
	return end;
}

function close() {
	if ( current ) {
		current.close();
	}
}

/* Bloques de texto a cuya derecha va el panel. */
const BLOCKS = 'p, li, dd, dt, blockquote, pre, td, th, h1, h2, h3, h4, h5, h6, ' +
	'figcaption, .poem, .mw-parser-output';

/**
 * A la derecha del bloque del texto; si ahí no cabe ni angostándolo hasta su
 * mínimo, a la izquierda; si tampoco, false. Arriba alineado con el inicio
 * del texto, dentro del viewport.
 *
 * @param {HTMLElement} el
 * @param {Element|Range} anchor
 * @return {boolean} se pudo ubicar al lado
 */
function beside( el, anchor ) {
	let node = anchor instanceof Range ? anchor.commonAncestorContainer : anchor;
	if ( node.nodeType !== Node.ELEMENT_NODE ) {
		node = node.parentElement;
	}
	const blockEl = node && node.closest( BLOCKS );
	if ( !blockEl || !document.contains( blockEl ) ) {
		return false;
	}
	const margin = 8;
	const gap = 16;
	const block = blockEl.getBoundingClientRect();
	const minWidth = 16 * parseFloat( getComputedStyle( document.documentElement ).fontSize );
	const rightRoom = window.innerWidth - margin - ( block.right + gap );
	const leftRoom = block.left - gap - margin;
	// Ancho de nacimiento (el de CSS) salvo que no quepa.
	if ( !el.classList.contains( 'constel-panel--sized' ) ) {
		el.style.width = '';
	}
	let left;
	if ( rightRoom >= minWidth ) {
		if ( el.offsetWidth > rightRoom ) {
			el.style.width = rightRoom + 'px';
		}
		left = block.right + gap;
	} else if ( leftRoom >= minWidth ) {
		if ( el.offsetWidth > leftRoom ) {
			el.style.width = leftRoom + 'px';
		}
		left = block.left - gap - el.offsetWidth;
	} else {
		return false;
	}
	const top = Math.min(
		anchor.getBoundingClientRect().top,
		window.innerHeight - el.offsetHeight - margin
	);
	el.style.left = ( left + window.scrollX ) + 'px';
	el.style.top = ( Math.max( margin, top ) + window.scrollY ) + 'px';
	return true;
}

/**
 * Al lado del texto (beside) si hay anclaje y lugar; si no, debajo de la
 * referencia si cabe, si no encima; siempre dentro del viewport.
 *
 * @param {HTMLElement} el
 * @param {DOMRect} near
 * @param {Element|Range|null} anchor
 */
function position( el, near, anchor ) {
	if ( anchor && beside( el, anchor ) ) {
		return;
	}
	const margin = 8;
	const width = el.offsetWidth;
	const height = el.offsetHeight;
	let left = Math.min( Math.max( margin, near.left ), window.innerWidth - width - margin );
	let top = near.bottom + margin;
	if ( top + height > window.innerHeight - margin && near.top - height - margin > margin ) {
		top = near.top - height - margin;
	}
	left = Math.max( margin, left );
	el.style.left = ( left + window.scrollX ) + 'px';
	el.style.top = ( Math.max( margin, top ) + window.scrollY ) + 'px';
}

/**
 * @param {HTMLElement} el
 * @param {KeyboardEvent} e
 */
function trapFocus( el, e ) {
	const focusable = Array.from( el.querySelectorAll(
		'button:not([disabled]), input:not([disabled]), [tabindex="0"]'
	) ).filter( ( f ) => f.offsetParent !== null );
	if ( !focusable.length ) {
		return;
	}
	const first = focusable[ 0 ];
	const last = focusable[ focusable.length - 1 ];
	if ( e.shiftKey && document.activeElement === first ) {
		e.preventDefault();
		last.focus();
	} else if ( !e.shiftKey && document.activeElement === last ) {
		e.preventDefault();
		first.focus();
	}
}

/**
 * Reubica el panel abierto (su contenido cambió de alto), salvo que el
 * lector ya lo haya movido.
 *
 * @param {DOMRect} near
 */
function reposition( near ) {
	if ( current && !current.moved ) {
		position( current.el, near, current.anchor );
	}
}

module.exports = { open, close, reposition, isOpen: () => current !== null };
