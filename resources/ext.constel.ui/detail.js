/**
 * Detalle de los §§ bajo un punto del texto (spec: PageReading): conceptos,
 * glosa y autor.
 *
 * Sobre un § propio es un formulario con los cambios EN ESPERA y un solo
 * botón al final: agregar conceptos (píldoras; una coma cierra cada uno),
 * quitar conceptos (× los marca), editar
 * la glosa. "Guardar" aplica todo; si se quitaron todos los conceptos, el §
 * se borra (spec: UncodedExcerptVanishes) y el botón lo advierte. Quien
 * modera puede borrar §§ ajenos (OwnOperationsOnly).
 */
const api = require( './api.js' );
const panel = require( './panel.js' );
const conceptPills = require( './conceptpills.js' );
const variants = require( './variants.js' );
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
 * @param {Array} excerpts los §§ bajo el punto
 * @param {Object} ctx {near, anchor, returnFocus, isMine, canAnnotate, canModerate, onChanged}
 */
function open( excerpts, ctx ) {
	const p = panel.open( {
		label: mw.msg( 'constel-detail-title' ),
		near: ctx.near,
		anchor: ctx.anchor,
		returnFocus: ctx.returnFocus
	} );
	const title = el( 'p', 'constel-panel__title' );
	title.append( el( 'span', 'constel-sign', '§' ), ' ', mw.msg( 'constel-detail-title' ) );
	p.body.appendChild( title );
	excerpts.forEach( ( excerpt ) => p.body.appendChild( section( excerpt, ctx ) ) );
	panel.reposition( ctx.near );
	// El campo para agregar concepto es lo más probable; si no hay, el primer control.
	const first = p.body.querySelector( 'input' ) || p.body.querySelector( 'button' );
	if ( first ) {
		first.focus();
	}
}

function section( excerpt, ctx ) {
	const mine = ctx.isMine( excerpt );
	const box = el( 'section', 'constel-excerpt' + ( mine ? ' constel-excerpt--mine' : '' ) );

	const by = el( 'p', 'constel-excerpt__by' );
	if ( mine ) {
		by.textContent = mw.msg( 'constel-detail-mine' );
	} else {
		by.textContent = excerpt.author === null ?
			mw.msg( 'constel-detail-hidden-user' ) :
			mw.msg( 'constel-detail-by', excerpt.author );
	}
	box.append( by );

	if ( mine && ctx.canAnnotate ) {
		box.append( editor( excerpt, ctx ) );
		return box;
	}

	// Lectura: conceptos y glosa.
	const chips = el( 'ul', 'constel-chips' );
	excerpt.concepts.forEach( ( c ) => chips.append( el( 'li', 'constel-chip', c.label ) ) );
	box.append( chips );
	if ( excerpt.gloss ) {
		box.append( el( 'div', 'constel-gloss-text', excerpt.gloss ) );
	}
	// Borrar: el moderador, lo ajeno; el autor sin derecho de anotar, lo
	// suyo (spec: RightToWithdraw).
	if ( ctx.canModerate || mine ) {
		box.append( deleteAction( excerpt, ctx ) );
	}
	return box;
}

/**
 * El § propio como formulario: conceptos, agregar concepto, glosa, Guardar.
 *
 * @param {Object} excerpt
 * @param {Object} ctx
 * @return {HTMLElement}
 */
function editor( excerpt, ctx ) {
	const form = el( 'form', 'constel-edit' );
	const removing = new Set();
	const feedback = el( 'div', 'constel-feedback' );
	feedback.setAttribute( 'role', 'alert' );

	// 1. Conceptos: × marca para quitar (se aplica al guardar).
	const chips = el( 'ul', 'constel-chips' );
	excerpt.concepts.forEach( ( concept ) => {
		const li = el( 'li', 'constel-chip' );
		li.append( el( 'span', 'constel-chip__label', concept.label ) );
		const remove = icons.iconButton(
			'x', mw.msg( 'constel-detail-remove', concept.label ), 'constel-chip__remove'
		);
		remove.setAttribute( 'aria-pressed', 'false' );
		remove.addEventListener( 'click', () => {
			const on = !removing.has( concept.id );
			if ( on ) {
				removing.add( concept.id );
			} else {
				removing.delete( concept.id );
			}
			li.classList.toggle( 'constel-chip--removing', on );
			remove.setAttribute( 'aria-pressed', String( on ) );
			refresh();
		} );
		li.append( remove );
		chips.append( li );
	} );

	// 2. Agregar conceptos: píldoras; no se ofrecen los que ya tiene.
	const addId = 'constel-add-' + excerpt.id;
	const addLabel = el( 'label', 'constel-label', mw.msg( 'constel-detail-add' ) );
	addLabel.htmlFor = addId;
	const adding = conceptPills.create( {
		id: addId,
		placeholder: mw.msg( 'constel-form-concept-placeholder' ),
		exclude: excerpt.concepts.map( ( c ) => c.label ),
		onChange: () => refresh()
	} );

	// 3. Glosa.
	const glossId = 'constel-gloss-' + excerpt.id;
	const glossLabel = el( 'label', 'constel-label', mw.msg( 'constel-form-gloss-label' ) );
	glossLabel.htmlFor = glossId;
	const gloss = el( 'textarea', 'constel-input constel-gloss' );
	gloss.id = glossId;
	gloss.rows = 3;
	gloss.value = excerpt.gloss || '';
	gloss.placeholder = mw.msg( 'constel-form-gloss-placeholder' );
	gloss.addEventListener( 'keydown', ( e ) => {
		if ( e.key === 'Enter' && ( e.ctrlKey || e.metaKey ) ) {
			e.preventDefault();
			form.requestSubmit();
		}
	} );

	// 4. Un solo botón.
	const actions = el( 'div', 'constel-actions' );
	const save = el( 'button', 'constel-button constel-button--primary', mw.msg( 'constel-detail-save' ) );
	save.type = 'submit';
	actions.append( save );

	const deletesExcerpt = () => removing.size === excerpt.concepts.length &&
		!adding.values().length;
	function refresh() {
		const danger = deletesExcerpt();
		save.textContent = mw.msg( danger ? 'constel-detail-save-delete' : 'constel-detail-save' );
		save.classList.toggle( 'constel-button--primary', !danger );
		save.classList.toggle( 'constel-button--danger', danger );
	}

	const fail = ( code, result ) => {
		save.disabled = false;
		feedback.innerHTML = api.describeError( code, result ).html;
		panel.reposition( ctx.near );
	};

	// Orden: agregar primero (así quitar todos y agregar uno no borra el §),
	// luego la glosa, al final quitar. Cada concepto nuevo va por separado:
	// si uno pide elegir variante, los ya sumados salen del campo y se retoma
	// desde ése. La cadena es una Promise nativa, que lleva UN solo motivo de
	// rechazo: el error de la API viaja empaquetado.
	const write = ( params, concept ) => api.write( params ).then( null,
		( code, result ) => $.Deferred().reject( { code, result, concept } ) );
	const apply = ( allowVariant ) => {
		const newGloss = gloss.value.trim();
		let chain = Promise.resolve();
		adding.values().forEach( ( concept, i ) => {
			chain = chain.then( () => write( {
				action: 'constel-codeexcerpt', excerpt: excerpt.id, concept,
				allowvariant: allowVariant && i === 0 ? 1 : undefined
			}, concept ).then( () => adding.remove( concept ) ) );
		} );
		if ( newGloss !== ( excerpt.gloss || '' ) ) {
			chain = chain.then( () => write( {
				action: 'constel-glossexcerpt', excerpt: excerpt.id, gloss: newGloss
			} ) );
		}
		removing.forEach( ( id ) => {
			chain = chain.then( () => write( {
				action: 'constel-uncodeexcerpt', excerpt: excerpt.id, concept: id
			} ) );
		} );
		save.disabled = true;
		chain.then( () => {
			panel.close();
			ctx.onChanged();
		}, ( { code, result, concept } ) => {
			const error = api.describeError( code, result );
			if ( error.code === 'variants' ) {
				save.disabled = false;
				variants.render( feedback, error, concept, {
					choose: ( v ) => {
						adding.replace( concept, v );
						apply( false );
					},
					createAnyway: () => apply( true )
				} );
				panel.reposition( ctx.near );
			} else {
				fail( code, result );
			}
		} );
	};

	form.addEventListener( 'submit', ( e ) => {
		e.preventDefault();
		if ( !adding.isOpen() && !save.disabled ) {
			apply( false );
		}
	} );

	form.append( chips, addLabel, adding.el, glossLabel, gloss, feedback, actions );
	return form;
}

/**
 * Borrar un § sin editarlo, con confirmación en línea: uno ajeno (sólo
 * moderadores) o uno propio cuando no se tiene el derecho de anotar.
 *
 * @param {Object} excerpt
 * @param {Object} ctx
 * @return {HTMLElement}
 */
function deleteAction( excerpt, ctx ) {
	const wrap = el( 'div', 'constel-actions' );
	const feedback = el( 'div', 'constel-feedback' );
	feedback.setAttribute( 'role', 'alert' );
	const del = el( 'button', 'constel-button constel-button--danger', mw.msg( 'constel-detail-delete' ) );
	del.type = 'button';
	del.addEventListener( 'click', () => {
		const confirm = el( 'div', 'constel-confirm' );
		confirm.append( el( 'span', null, mw.msg( 'constel-detail-delete-confirm' ) ) );
		const no = el( 'button', 'constel-button', mw.msg( 'constel-detail-delete-no' ) );
		no.type = 'button';
		const yes = el( 'button', 'constel-button constel-button--danger', mw.msg( 'constel-detail-delete-yes' ) );
		yes.type = 'button';
		no.addEventListener( 'click', () => {
			confirm.replaceWith( del );
			del.focus();
		} );
		yes.addEventListener( 'click', () => api.write( { action: 'constel-deleteexcerpt', excerpt: excerpt.id } )
			.then( () => {
				panel.close();
				ctx.onChanged();
			}, ( code, result ) => {
				feedback.innerHTML = api.describeError( code, result ).html;
			} ) );
		confirm.append( no, yes );
		del.replaceWith( confirm );
		no.focus();
	} );
	wrap.append( del, feedback );
	return wrap;
}

module.exports = { open };
