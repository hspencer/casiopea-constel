/**
 * Campo de conceptos como píldoras (formulario del § y detalle del § propio):
 * lo escrito se vuelve píldora con una coma o al elegirlo de la lista, y queda
 * dentro del mismo campo; × o Retroceso en el campo vacío la quitan.
 *
 * La identidad de un concepto es estricta (como un título MW): dos píldoras
 * son la misma sólo si se escriben igual. Lo escrito sin coma también cuenta
 * (values()), para que Guardar no pierda el último concepto.
 */
const autocomplete = require( './autocomplete.js' );
const icons = require( './icons.js' );

function el( tag, className, text ) {
	const node = document.createElement( tag );
	if ( className ) {
		node.className = className;
	}
	if ( text !== undefined ) {
		node.textContent = text;
	}
	return node;
}

/**
 * @param {Object} opts
 * @param {string} opts.id id del input (para su <label>)
 * @param {string} opts.placeholder
 * @param {number} [opts.maxLength]
 * @param {string[]} [opts.exclude] conceptos que no se ofrecen ni se agregan
 * @param {Function} [opts.onChange] () => void, al agregar, quitar o escribir
 * @return {{el: HTMLElement, input: HTMLInputElement, values: Function,
 *  remove: Function, replace: Function, isOpen: Function}}
 */
function create( opts ) {
	const exclude = opts.exclude || [];
	let pills = [];

	const box = el( 'div', 'constel-pills__box constel-concepts' );
	const list = el( 'ul', 'constel-chips constel-pills__list' );
	const field = el( 'div', 'constel-field constel-pills__field' );
	const input = el( 'input', 'constel-input constel-pills__input' );
	input.id = opts.id;
	input.type = 'text';
	input.placeholder = opts.placeholder;
	if ( opts.maxLength ) {
		input.maxLength = opts.maxLength;
	}
	field.append( input );
	box.append( list, field );
	// Un clic en el hueco del campo es un clic en el campo.
	box.addEventListener( 'mousedown', ( e ) => {
		if ( e.target === box || e.target === list ) {
			e.preventDefault();
			input.focus();
		}
	} );

	const changed = () => {
		if ( opts.onChange ) {
			opts.onChange();
		}
	};
	const render = () => {
		list.textContent = '';
		pills.forEach( ( label ) => {
			const li = el( 'li', 'constel-chip constel-pill' );
			li.append( el( 'span', 'constel-chip__label', label ) );
			const remove = icons.iconButton(
				'x', mw.msg( 'constel-detail-remove', label ), 'constel-chip__remove'
			);
			remove.addEventListener( 'click', () => {
				pills = pills.filter( ( p ) => p !== label );
				render();
				changed();
				input.focus();
			} );
			li.append( remove );
			list.append( li );
		} );
		input.placeholder = pills.length ? '' : opts.placeholder;
	};
	const add = ( text ) => {
		const label = text.trim();
		if ( label && !pills.includes( label ) && !exclude.includes( label ) ) {
			pills.push( label );
			render();
		}
		changed();
	};

	const combo = autocomplete.attach( input, {
		source: ( typed ) => autocomplete.conceptSource( typed ).then( ( found ) => found
			.filter( ( c ) => !pills.includes( c.label ) && !exclude.includes( c.label ) ) ),
		onPick: ( label ) => {
			input.value = '';
			add( label );
		}
	} );

	input.addEventListener( 'keydown', ( e ) => {
		if ( e.key === ',' ) {
			e.preventDefault();
			combo.close();
			add( input.value );
			input.value = '';
		} else if ( e.key === 'Backspace' && input.value === '' && pills.length ) {
			pills.pop();
			render();
			changed();
		}
	} );
	// Lo pegado con comas se reparte en píldoras; lo último queda escrito.
	input.addEventListener( 'input', () => {
		if ( input.value.includes( ',' ) ) {
			const parts = input.value.split( ',' );
			input.value = parts.pop().trimStart();
			parts.forEach( add );
		}
		changed();
	} );

	return {
		el: box,
		input,
		/** @return {string[]} píldoras y, al final, lo escrito sin coma */
		values: () => {
			const typed = input.value.trim();
			return typed && !pills.includes( typed ) && !exclude.includes( typed ) ?
				pills.concat( typed ) : pills.slice();
		},
		/**
		 * Quita un concepto ya guardado (píldora o lo escrito).
		 *
		 * @param {string} label
		 */
		remove: ( label ) => {
			if ( input.value.trim() === label ) {
				input.value = '';
			}
			pills = pills.filter( ( p ) => p !== label );
			render();
		},
		/**
		 * Cambia un concepto por otro (una variante elegida).
		 *
		 * @param {string} from
		 * @param {string} to
		 */
		replace: ( from, to ) => {
			if ( input.value.trim() === from ) {
				input.value = to;
			}
			pills = pills.map( ( p ) => p === from ? to : p );
			render();
		},
		isOpen: combo.isOpen
	};
}

module.exports = { create };
