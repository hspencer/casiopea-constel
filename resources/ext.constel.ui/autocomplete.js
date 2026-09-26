/**
 * Autocompletado. Por defecto, del vocabulario compartido
 * (spec: SharedVocabularyAutocomplete); con opts.source, de cualquier otra
 * fuente (usuarios, páginas). Patrón ARIA combobox: el input conserva el
 * foco; las flechas recorren la lista; Enter elige; Escape cierra sólo la
 * lista.
 */
const api = require( './api.js' );

let seq = 0;

/**
 * Fuente por defecto: conceptos del vocabulario, con su uso como pista.
 *
 * @param {string} typed
 * @return {Promise<Array<{label: string, hint: string}>>}
 */
function conceptSource( typed ) {
	return api.searchConcepts( typed ).then( ( concepts ) => concepts.map( ( c ) => ( {
		label: c.label,
		hint: mw.msg( 'constel-suggestion-uses', mw.language.convertNumber( c.uses ), c.uses )
	} ) ) );
}

/**
 * @param {HTMLInputElement} input
 * @param {Object} [opts]
 * @param {Function} [opts.onPick] (label, item) => void
 * @param {Function} [opts.source] (typed) => Promise<Array<{label, value?, hint?}>>
 * @return {{isOpen: Function, close: Function}}
 */
function attach( input, opts = {} ) {
	const id = 'constel-ac-' + ( ++seq );
	const list = document.createElement( 'ul' );
	list.id = id;
	list.className = 'constel-ac';
	list.setAttribute( 'role', 'listbox' );
	list.hidden = true;
	input.after( list );
	input.setAttribute( 'role', 'combobox' );
	input.setAttribute( 'aria-autocomplete', 'list' );
	input.setAttribute( 'aria-controls', id );
	input.setAttribute( 'aria-expanded', 'false' );
	input.autocomplete = 'off';

	let active = -1;
	let timer = null;
	let request = 0;

	const options = () => Array.from( list.children );
	const setActive = ( i ) => {
		options().forEach( ( o, j ) => o.setAttribute( 'aria-selected', String( j === i ) ) );
		active = i;
		if ( i >= 0 ) {
			input.setAttribute( 'aria-activedescendant', options()[ i ].id );
		} else {
			input.removeAttribute( 'aria-activedescendant' );
		}
	};
	const closeList = () => {
		list.hidden = true;
		input.setAttribute( 'aria-expanded', 'false' );
		setActive( -1 );
	};
	let current = [];
	const pick = ( item ) => {
		input.value = item.label;
		closeList();
		if ( opts.onPick ) {
			opts.onPick( item.label, item );
		}
	};
	const source = opts.source || conceptSource;
	const render = ( items ) => {
		current = items;
		list.textContent = '';
		items.forEach( ( c, i ) => {
			const li = document.createElement( 'li' );
			li.id = id + '-' + i;
			li.setAttribute( 'role', 'option' );
			li.className = 'constel-ac__option';
			const label = document.createElement( 'span' );
			label.textContent = c.label;
			li.append( label );
			if ( c.hint ) {
				const hint = document.createElement( 'span' );
				hint.className = 'constel-ac__uses';
				hint.textContent = c.hint;
				li.append( hint );
			}
			li.addEventListener( 'mousedown', ( e ) => {
				e.preventDefault();
				pick( c );
			} );
			list.appendChild( li );
		} );
		list.hidden = !items.length;
		input.setAttribute( 'aria-expanded', String( !list.hidden ) );
		setActive( -1 );
	};

	input.addEventListener( 'input', () => {
		clearTimeout( timer );
		const typed = input.value.trim();
		if ( !typed ) {
			closeList();
			return;
		}
		timer = setTimeout( () => {
			const mine = ++request;
			source( typed ).then( ( items ) => {
				if ( mine === request ) {
					render( items );
				}
			}, () => render( [] ) );
		}, 150 );
	} );
	input.addEventListener( 'keydown', ( e ) => {
		const n = options().length;
		if ( list.hidden || !n ) {
			return;
		}
		if ( e.key === 'ArrowDown' ) {
			e.preventDefault();
			setActive( ( active + 1 ) % n );
		} else if ( e.key === 'ArrowUp' ) {
			e.preventDefault();
			setActive( ( active - 1 + n ) % n );
		} else if ( e.key === 'Enter' && active >= 0 ) {
			e.preventDefault();
			e.stopPropagation();
			pick( current[ active ] );
		} else if ( e.key === 'Escape' ) {
			e.preventDefault();
			e.stopPropagation();
			closeList();
		}
	} );
	input.addEventListener( 'blur', () => setTimeout( closeList, 100 ) );

	return { isOpen: () => !list.hidden, close: closeList };
}

module.exports = { attach, conceptSource };
