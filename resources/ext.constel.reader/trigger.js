/**
 * La afordancia "§" (spec: SelectionPopup.AppearsOnSelection,
 * OnlyContentSelections, KeyboardOperable).
 *
 * Aparece al terminar una selección (ratón, táctil o teclado) de al menos N
 * caracteres contenida en el cuerpo de contenido. Con teclado: tras
 * seleccionar, Alt+Mayús+Intro abre el formulario.
 */
const canonical = require( './canonical.js' );
const config = require( './config.json' );

/**
 * @param {Element} root
 * @return {Object|null} {exact, prefix, suffix, start, rect, range}
 */
function currentSelection( root ) {
	const sel = window.getSelection();
	if ( !sel || sel.rangeCount === 0 || sel.isCollapsed ) {
		return null;
	}
	const range = sel.getRangeAt( 0 );
	if ( !root.contains( range.startContainer ) || !root.contains( range.endContainer ) ) {
		return null;
	}
	// Ni dentro de la UI de con§tel ni de zonas excluidas o editables.
	for ( const node of [ range.startContainer, range.endContainer ] ) {
		const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
		for ( let e = el; e && e !== root; e = e.parentElement ) {
			if ( canonical.isExcluded( e ) || e.isContentEditable || e.matches( 'input, textarea, select' ) ) {
				return null;
			}
		}
	}
	const { index, segments } = canonical.read( root );
	let start = canonical.positionOf( segments, range.startContainer, range.startOffset );
	let end = canonical.positionOf( segments, range.endContainer, range.endOffset );
	if ( start === null || end === null || end <= start ) {
		return null;
	}
	// Sin espacios en los bordes, como constel.
	while ( start < end && /\s/u.test( index.slice( start, start + 1 ) ) ) {
		start++;
	}
	while ( end > start && /\s/u.test( index.slice( end - 1, end ) ) ) {
		end--;
	}
	const exact = index.slice( start, end );
	const length = end - start;
	if ( length < config.selectionMinLength || length > config.selectionMaxLength ) {
		return null;
	}
	const context = config.anchorContextLength;
	return {
		exact,
		prefix: index.slice( Math.max( 0, start - context ), start ),
		suffix: index.slice( end, Math.min( index.length, end + context ) ),
		start,
		rect: range.getBoundingClientRect(),
		range: range.cloneRange()
	};
}

/**
 * Desplazamiento vertical (en em) que centra la TINTA del «§» en su caja: el
 * glifo no está centrado en su línea (baja bajo la línea de base y sube
 * hasta las mayúsculas), así que centrar la línea lo deja corrido. Se mide
 * en un canvas con la tipografía real (line-height 1), una vez por fuente.
 *
 * @param {Element} glyph
 * @return {number}
 */
function inkShift( glyph ) {
	const style = getComputedStyle( glyph );
	const font = `${ style.fontStyle } ${ style.fontWeight } 100px ${ style.fontFamily }`;
	inkShift.cache = inkShift.cache || new Map();
	if ( !inkShift.cache.has( font ) ) {
		const ctx = document.createElement( 'canvas' ).getContext( '2d' );
		ctx.font = font;
		const m = ctx.measureText( '§' );
		// Con line-height 1 la línea mide 1em y la línea de base cae a
		// (1em − alto de la fuente) / 2 + ascendente desde arriba.
		const baseline = ( 100 - m.fontBoundingBoxAscent - m.fontBoundingBoxDescent ) / 2 +
			m.fontBoundingBoxAscent;
		const inkCenter = baseline - ( m.actualBoundingBoxAscent - m.actualBoundingBoxDescent ) / 2;
		inkShift.cache.set( font, ( 50 - inkCenter ) / 100 );
	}
	return inkShift.cache.get( font );
}

/**
 * @param {Element} root
 * @param {Function} onActivate (selection, button) => void
 */
function install( root, onActivate ) {
	const button = document.createElement( 'button' );
	button.type = 'button';
	button.className = 'constel-ui constel-trigger';
	const glyph = document.createElement( 'span' );
	glyph.className = 'constel-trigger__glyph';
	glyph.textContent = '§';
	glyph.setAttribute( 'aria-hidden', 'true' );
	button.append( glyph );
	button.setAttribute( 'aria-label', mw.msg( 'constel-trigger-label' ) );
	button.title = mw.msg( 'constel-trigger-label' );
	button.hidden = true;
	document.body.appendChild( button );

	let pending = null;

	const hide = () => {
		button.hidden = true;
		pending = null;
	};
	const refresh = () => {
		pending = currentSelection( root );
		if ( !pending ) {
			button.hidden = true;
			return;
		}
		const r = pending.rect;
		button.hidden = false;
		// Al mostrarse, la tipografía web ya está (o su respaldo): se mide ésa.
		glyph.style.setProperty( '--constel-trigger-dy', inkShift( glyph ) + 'em' );
		const size = button.offsetWidth;
		button.style.left = ( Math.min( r.right + 4, window.innerWidth - size - 8 ) + window.scrollX ) + 'px';
		button.style.top = ( Math.max( 8, r.top - size - 4 ) + window.scrollY ) + 'px';
	};
	const activate = () => {
		if ( pending ) {
			const selection = pending;
			hide();
			onActivate( selection, button );
		}
	};

	// mousedown en el botón no debe deshacer la selección.
	button.addEventListener( 'mousedown', ( e ) => e.preventDefault() );
	button.addEventListener( 'click', activate );
	document.addEventListener( 'mouseup', ( e ) => {
		if ( !button.contains( e.target ) ) {
			setTimeout( refresh, 10 );
		}
	} );
	document.addEventListener( 'touchend', () => setTimeout( refresh, 10 ) );
	document.addEventListener( 'keyup', ( e ) => {
		if ( e.shiftKey || e.key === 'Shift' ) {
			refresh();
		}
	} );
	document.addEventListener( 'keydown', ( e ) => {
		if ( e.altKey && e.shiftKey && e.key === 'Enter' ) {
			refresh();
			if ( pending ) {
				e.preventDefault();
				activate();
			}
		}
	} );
	document.addEventListener( 'selectionchange', () => {
		const sel = window.getSelection();
		if ( !sel || sel.isCollapsed ) {
			hide();
		}
	} );
}

module.exports = { install, currentSelection };
