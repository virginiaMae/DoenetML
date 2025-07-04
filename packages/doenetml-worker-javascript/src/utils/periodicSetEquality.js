import me from "math-expressions";

export default function periodicSetEquality(
    expr,
    other,
    { min_elements_match = 3, match_partial = false } = {},
) {
    // expr must be a discrete infinite set
    if (!is_periodic_set(expr)) return false;

    // other must be a discrete infinite set or a list
    if (is_periodic_set(other)) {
        if (match_partial) {
            let match1 = contained_in(expr.tree, other.tree, match_partial);
            if (match1 === false) {
                return 0;
            }
            let match2 = contained_in(other.tree, expr.tree, match_partial);
            if (match2 === false) {
                return 0;
            }

            if (match1 === true) {
                if (match2 === true) {
                    return 1;
                } else {
                    return match2;
                }
            } else if (match2 === true) {
                return match1;
            } else {
                return Math.min(match1, match2);
            }
        } else {
            return (
                contained_in(expr.tree, other.tree, match_partial) &&
                contained_in(other.tree, expr.tree, match_partial)
            );
        }
    } else {
        let operands = expr.tree.slice(1);

        // implemented only if have just one tuple defining set
        if (operands.length > 1) {
            return false;
        }

        let offset = me.fromAst(operands[0][1]).evaluate_to_constant();
        let period = me
            .fromAst(["apply", "abs", operands[0][2]])
            .evaluate_to_constant();

        if (!Number.isFinite(offset) || !Number.isFinite(period)) {
            return false;
        }

        let min_index = operands[0][3];
        let max_index = operands[0][4];

        // implemented only if min_index is -infinity and max_index is infinity
        if (min_index !== -Infinity || max_index !== Infinity) {
            return false;
        }

        // check if other is a list that begins and ends in 'ldots'
        if (other.tree[0] !== "list") {
            return false;
        }

        let number_list = other.tree.slice(1);

        let n_ldots = 0;

        if (number_list[0][0] === "ldots") {
            n_ldots++;
            number_list = number_list.slice(1);
        } else if (!match_partial) {
            return false;
        }

        if (number_list[number_list.length - 1][0] === "ldots") {
            n_ldots++;
            number_list = number_list.slice(0, number_list.length - 1);
        } else if (!match_partial) {
            return false;
        }

        let n_in_list = number_list.length;
        if (n_in_list === 0) {
            return false;
        }

        if (!match_partial && n_in_list < min_elements_match) {
            return false;
        }

        number_list = number_list.map((x) =>
            me.fromAst(x).evaluate_to_constant(),
        );

        // use me.math.mod rather than % so it always non-negative
        let offset_diff = me.math.mod(number_list[0] - offset, period);

        if (
            !(me.math.min(offset_diff, period - offset_diff) < 1e-10 * period)
        ) {
            return false;
        }

        let n_matches = 1;

        for (let i = 1; i < n_in_list; i++) {
            if (
                Math.abs(number_list[i] - number_list[i - 1] - period) <
                1e-10 * period
            ) {
                n_matches++;
            } else {
                if (!match_partial) {
                    return false;
                }
                break;
            }
        }

        if (
            n_matches === n_in_list &&
            n_ldots === 2 &&
            n_in_list >= min_elements_match
        ) {
            return true;
        }

        let fraction_matched =
            n_matches / Math.max(n_in_list, min_elements_match);

        // penalize if don't have dots
        // max 80% without dots
        fraction_matched *= (9 + n_ldots / 2) / 10;

        return fraction_matched;

        // let the_list = other_tree.slice(0,n_in_list+1);

        // // get list of same size from
        // let generated_list = sequence_from_discrete_infinite(expr, n_in_list);

        // if(!generated_list)
        //   return false;

        // generated_list = ['list'].concat(generated_list);

        // return full_equals(expr.context.from(generated_list), other.context.from(the_list));

        return false;

        // check if other is a list than ends in 'ldots'
        // let other_tree = other.tree;

        // if(other_tree[0] !== 'list')
        //   return false;

        // let n_in_list = other_tree.length-2;

        // if(other_tree[n_in_list+1][0] !== 'ldots')
        //   return false;

        // if(n_in_list < min_elements_match)
        //   return false;

        // let the_list = other_tree.slice(0,n_in_list+1);

        // // get list of same size from
        // let generated_list = sequence_from_discrete_infinite(expr, n_in_list);

        // if(!generated_list)
        //   return false;

        // generated_list = ['list'].concat(generated_list);

        // return full_equals(expr.context.from(generated_list), other.context.from(the_list));
    }
}

function is_periodic_set(expr) {
    var tree = expr.tree;
    if (!Array.isArray(tree)) return false;
    if (tree[0] !== "periodic_set") return false;
    var operands = tree.slice(1);

    for (var v of operands) {
        if (!Array.isArray(v)) return false;
        if (v[0] !== "tuple") return false;
        if (v.length !== 5) return false;
    }

    return true;
}

function contained_in(tree, i_set, match_partial) {
    // true if tree is contained in the discrete infinite set i_set
    // tree is either a discrete infinite set
    // or a tuple of form [offset, period, min_index, max_index]

    if (tree[0] === "periodic_set") {
        if (match_partial) {
            let num_matches = 0;
            for (let piece of tree.slice(1)) {
                let match = contained_in(piece, i_set, match_partial);
                if (match === true) {
                    num_matches++;
                } else if (match !== false) {
                    num_matches += match;
                }
            }

            let num_pieces = tree.length - 1;

            if (num_matches === num_pieces) {
                return true;
            } else if (num_matches === 0) {
                return false;
            } else {
                return num_matches / num_pieces;
            }
        } else {
            return tree.slice(1).every((v) => contained_in(v, i_set));
        }
    }

    // tree is a tuple of the form [offset, period, min_index, max_index]

    var offset0 = tree[1];
    var period0 = tree[2];
    var min_index = tree[3];
    var max_index = tree[4];

    // implemented only if min_index === -infinity and max_index === infinity
    if (min_index !== -Infinity || max_index !== Infinity) return false;

    // normalize to period 1
    offset0 = me.fromAst(["/", offset0, period0]).evaluate_to_constant();

    // if(!(typeof offset0 === 'number'))
    //   return false;

    var tuples = i_set.slice(1);

    // data will be array of form [p, q, offset, period]
    // where offset and period are normalized by period0
    // and p/q is fraction form of period

    var data = [];
    for (let i = 0; i < tuples.length; i++) {
        // implemented only if min_index === -infinity and max_index === infinity
        let this_min_index = tuples[i][3];
        let this_max_index = tuples[i][4];
        if (this_min_index !== -Infinity || this_max_index !== Infinity)
            return false;

        let offset = me
            .fromAst(["/", tuples[i][1], period0])
            .evaluate_to_constant();
        let period = me
            .fromAst(["apply", "abs", ["/", tuples[i][2], period0]])
            .evaluate_to_constant();

        if (typeof period !== "number" || Number.isNaN(period)) return false;

        let frac = me.math.fraction(period);
        let p = me.math.number(frac.n);

        if (p > 1000) {
            return false;
        }

        let q = me.math.number(frac.d);
        data.push([p, q, offset, period]);
    }

    // sort by p
    data.sort();

    // check any with period for which original period is a multiple
    while (true) {
        let p = data[0][0];
        if (p !== 1) break;

        let offset = data[0][2];
        let period = data[0][3];

        // offsets match, then we've covered all of tree
        let offset_diff = me
            .fromAst(["+", offset, ["-", offset0]])
            .evaluate_to_constant();

        if (Number.isFinite(offset_diff) && Number.isFinite(period)) {
            // use me.math.mod rather than % so it always non-negative
            offset_diff = me.math.mod(offset_diff, period);

            if (me.math.min(offset_diff, period - offset_diff) < 1e-10 * period)
                return true;
        }
        data.splice(0, 1); // remove first entry from data
        if (data.length === 0) return false;
    }

    var all_ps = [...new Set(data.map((v) => v[0]))];

    let max_fraction_covered = 0;

    for (let base_p of all_ps) {
        // find all ps where base_p is a multiple
        let options = data
            .map(function (v, i) {
                let m = base_p / v[0];
                if (Number.isInteger(m)) return [v[0], m, i];
                else return undefined;
            })
            .filter((v) => v);

        let covered = [];

        for (let opt of options) {
            let p = opt[0];
            let m = opt[1];
            let i = opt[2];
            let offset = data[i][2];
            let period = data[i][3];

            for (let j = 0; j < p; j++) {
                let offset_diff = me
                    .fromAst(["+", offset, ["-", ["+", offset0, j]]])
                    .evaluate_to_constant();

                // use me.math.mod rather than % so it always non-negative
                if (Number.isFinite(offset_diff) && Number.isFinite(period)) {
                    offset_diff = me.math.mod(offset_diff, period);

                    if (
                        me.math.min(offset_diff, period - offset_diff) <
                        1e-10 * period
                    ) {
                        for (let k = 0; k < m; k++) {
                            covered[j + k * p] = true;
                        }

                        // check to see if covered all;
                        let covered_all = true;
                        for (let ind = 0; ind < base_p; ind++) {
                            if (!covered[ind]) {
                                covered_all = false;
                                break;
                            }
                        }

                        if (covered_all) return true;

                        break;
                    }
                }
            }
        }

        if (match_partial) {
            let fraction_covered = 0;
            for (let ind = 0; ind < base_p; ind++) {
                if (covered[ind]) {
                    fraction_covered++;
                }
            }
            fraction_covered /= base_p;

            if (fraction_covered > max_fraction_covered) {
                max_fraction_covered = fraction_covered;
            }
        }
    }

    if (match_partial && max_fraction_covered > 0) {
        return max_fraction_covered;
    }

    return false;
}

function sequence_from_discrete_infinite(expr, n_elements) {
    // assuming without checking that expr is discrete infinite set

    var tree = expr.tree;
    var operands = tree.slice(1);

    // implemented only if have just one tuple defining set
    if (operands.length > 1) return;

    let offset = operands[0][1];
    let period = operands[0][2];
    let min_index = simplify.evaluate_numbers(operands[0][3]);
    let max_index = operands[0][4];

    // implemented only if min_index is defined and an integer and max_index is infinity
    if (!Number.isInteger(min_index) || max_index !== Infinity) return;

    let result = [];

    for (let i = 0; i < n_elements; i++) {
        result.push(
            simplify.evaluate_numbers([
                "+",
                ["*", period, min_index + i],
                offset,
            ]),
        );
    }

    return result;
}
