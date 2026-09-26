/**
 * Minimapa de §§: un trazo vertical fijo a la izquierda (desde bajo la
 * cabecera hasta el pie de la ventana) que representa el texto entero de la
 * página. Cada § dibujado es un trazo horizontal a la altura proporcional de
 * su primera marca. Al pasar encima se leen sus conceptos; al activarlo, la
 * página se desplaza hasta el §.
 *
 * Sólo lee las marcas que ya dibujó marks.js: no mide texto por su cuenta.
 *
 * Un § nuevo, o uno que ganó conceptos, entra con una animación (el trazo
 * brota del eje y deja una onda de su color) y sus conceptos se asoman un
 * momento junto a él. La primera pintura de la página no se anima.
 */
const marks = require( './marks.js' );

/* Trazos más cercanos que esto (px en la barra) se funden en uno solo. */
const MERGE_PX = 4;

let bar = null;
let tip = null;
let root = null;
let items = [];
let observer = null;
let observedRoot = null;

/* Conceptos de cada § en la pasada anterior (id → rótulos), y lo que entra. */
let known = null;
let fresh = new Set();
let freshAt = 0;
let freshTimer = null;
/* Lo que dura la entrada (ms); igual que la onda en reader.css. */
const FRESH_MS = 1400;
/* Cuánto se asoman los conceptos nuevos (ms). */
const PEEK_MS = 2200;

function firstMark( id ) {
	return root.querySelector( '.' + marks.MARK_CLASS + '[data-constel-excerpt="' + id + '"]' );
}

/**
 * @param {boolean} [endPeek] también si los conceptos se están asomando (la
 *  barra es fija: desplazar o redibujar no los deja fuera de lugar)
 */
function hideTip( endPeek ) {
	if ( tip && ( endPeek === true || !tip.classList.contains( 'constel-minimap__tip--peek' ) ) ) {
		clearTimeout( freshTimer );
		tip.hidden = true;
		tip.classList.remove( 'constel-minimap__tip--peek' );
	}
}

function showTip( tick ) {
	hideTip( true );
	tip.textContent = tick.dataset.labels;
	tip.hidden = false;
	const r = tick.getBoundingClientRect();
	const top = Math.max( 4, Math.min( r.top + r.height / 2 - tip.offsetHeight / 2,
		window.innerHeight - tip.offsetHeight - 4 ) );
	tip.style.top = top + 'px';
	tip.style.left = ( r.right + 6 ) + 'px';
}

function go( tick ) {
	const mark = firstMark( tick.dataset.excerpt );
	if ( !mark ) {
		return;
	}
	hideTip( true );
	const still = window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
	mark.scrollIntoView( { block: 'center', behavior: still ? 'auto' : 'smooth' } );
	mark.focus( { preventScroll: true } );
}

function ensureBar() {
	if ( bar ) {
		return;
	}
	bar = document.createElement( 'nav' );
	bar.className = 'constel-ui constel-minimap';
	bar.setAttribute( 'aria-label', mw.msg( 'constel-minimap-label' ) );
	tip = document.createElement( 'div' );
	tip.className = 'constel-ui constel-minimap__tip';
	tip.setAttribute( 'aria-hidden', 'true' );
	tip.hidden = true;
	document.body.append( bar, tip );

	bar.addEventListener( 'click', ( e ) => {
		const tick = e.target.closest( '.constel-minimap__tick' );
		if ( tick ) {
			go( tick );
		}
	} );
	const onEnter = ( e ) => {
		const tick = e.target.closest( '.constel-minimap__tick' );
		if ( tick ) {
			showTip( tick );
		}
	};
	bar.addEventListener( 'mouseover', onEnter );
	bar.addEventListener( 'focusin', onEnter );
	bar.addEventListener( 'mouseleave', () => hideTip( true ) );
	bar.addEventListener( 'focusout', () => hideTip( true ) );
	window.addEventListener( 'scroll', () => hideTip(), { passive: true } );

	// El texto y la ventana cambian de alto (imágenes que cargan, plegables,
	// cambio de tamaño): se vuelven a ubicar los trazos.
	if ( window.ResizeObserver ) {
		observer = new ResizeObserver( () => layout() );
		observer.observe( bar );
	} else {
		window.addEventListener( 'resize', () => layout() );
	}
}

/**
 * Ubica los trazos según el alto actual del texto y de la barra.
 *
 * @return {HTMLElement|null} el primer trazo que está entrando
 */
function layout() {
	if ( !bar || !root ) {
		return null;
	}
	bar.hidden = !items.length;
	const height = bar.clientHeight;
	const rootRect = root.getBoundingClientRect();
	const total = rootRect.height;
	// Un solo cambio al DOM por pasada, para no re-disparar el observador.
	const ticks = document.createDocumentFragment();
	if ( !items.length || !height || !total ) {
		bar.replaceChildren();
		return null;
	}

	// Altura de cada § (su primera marca, que es la que lleva el foco).
	const placed = [];
	for ( const item of items ) {
		const mark = firstMark( item.excerpt.id );
		if ( mark ) {
			const y = ( mark.getBoundingClientRect().top - rootRect.top ) / total;
			placed.push( { y: Math.max( 0, Math.min( 1, y ) ) * height, item } );
		}
	}
	placed.sort( ( a, b ) => a.y - b.y );

	// Vecinos fundidos: un trazo por grupo, con todos sus conceptos.
	const groups = [];
	for ( const p of placed ) {
		const last = groups[ groups.length - 1 ];
		if ( last && p.y - last.y < MERGE_PX ) {
			last.members.push( p.item );
		} else {
			groups.push( { y: p.y, members: [ p.item ] } );
		}
	}

	const elapsed = performance.now() - freshAt;
	const freshIds = fresh.size && elapsed < FRESH_MS ? fresh : new Set();
	let firstFresh = null;
	for ( const g of groups ) {
		const labels = [];
		g.members.forEach( ( m ) => m.excerpt.concepts.forEach( ( c ) => {
			if ( !labels.includes( c.label ) ) {
				labels.push( c.label );
			}
		} ) );
		const lead = g.members.find( ( m ) => m.mine ) || g.members[ 0 ];
		const tick = document.createElement( 'button' );
		tick.type = 'button';
		// Clases: constel-minimap__tick, constel-minimap__tick--mine,
		// constel-minimap__tick--hued
		tick.className = 'constel-minimap__tick';
		if ( lead.mine ) {
			tick.classList.add( 'constel-minimap__tick--mine' );
		} else if ( lead.hue !== null ) {
			tick.classList.add( 'constel-minimap__tick--hued' );
			tick.style.setProperty( '--constel-hue', String( lead.hue ) );
		}
		tick.style.top = g.y + 'px';
		tick.dataset.excerpt = String( lead.excerpt.id );
		tick.dataset.labels = labels.join( ' · ' );
		tick.setAttribute( 'aria-label', mw.msg( 'constel-mark-label', labels.join( ', ' ) ) );
		// Si un relayout (el texto cambió de alto) rehace el trazo a media
		// entrada, la animación sigue donde iba en vez de empezar de nuevo.
		if ( g.members.some( ( m ) => freshIds.has( m.excerpt.id ) ) ) {
			tick.classList.add( 'constel-minimap__tick--fresh' );
			tick.style.setProperty( '--constel-fresh-delay', -Math.round( elapsed ) + 'ms' );
			firstFresh = firstFresh || tick;
		}
		ticks.append( tick );
	}
	bar.replaceChildren( ticks );
	return firstFresh;
}

/**
 * Los conceptos del § que entra se asoman junto a su trazo y se van solos.
 *
 * @param {HTMLElement} tick
 */
function peek( tick ) {
	showTip( tick );
	tip.classList.add( 'constel-minimap__tip--peek' );
	freshTimer = setTimeout( () => hideTip( true ), PEEK_MS );
}

/**
 * §§ que no estaban en la pasada anterior o que ganaron conceptos.
 *
 * @param {Array} list items
 * @return {Set<number>}
 */
function entering( list ) {
	const now = new Map( list.map( ( i ) => [ i.excerpt.id,
		i.excerpt.concepts.map( ( c ) => c.label ) ] ) );
	const found = new Set();
	if ( known ) {
		now.forEach( ( labels, id ) => {
			const before = known.get( id );
			if ( !before || labels.some( ( l ) => !before.includes( l ) ) ) {
				found.add( id );
			}
		} );
	}
	known = now;
	return found;
}

/**
 * Redibuja el minimapa con los §§ visibles; sin §§, se oculta.
 *
 * @param {Element} contentRoot
 * @param {Array} excerpts los §§ visibles según el alcance
 * @param {Function} isMine (excerpt) => boolean
 */
function update( contentRoot, excerpts, isMine ) {
	root = contentRoot;
	items = excerpts.map( ( excerpt ) => ( {
		excerpt,
		mine: isMine( excerpt ),
		hue: excerpt.author && !excerpt.userhidden ? marks.authorHue( excerpt.author ) : null
	} ) );
	if ( !items.length && !bar ) {
		return;
	}
	ensureBar();
	if ( observer && observedRoot !== root ) {
		observer.observe( root );
		observedRoot = root;
	}
	hideTip();
	const found = entering( items );
	if ( found.size ) {
		fresh = found;
		freshAt = performance.now();
	}
	const tick = layout();
	// Uno solo (lo que se acaba de anotar): se asoman sus conceptos. Muchos
	// (cambio de alcance) sólo entran.
	if ( tick && found.size === 1 ) {
		peek( tick );
	}
}

module.exports = { update };
