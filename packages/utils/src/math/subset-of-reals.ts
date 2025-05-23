/*
  Based on subsets-of-reals, version 0.0.1
  by Jim Fowler <fowler@math.osu.edu> (http://kisonecat.com/)
  github.com/kisonecat/subsets-of-reals

  Redistributed and modified under the terms of GPL-3.0

*/

//@ts-ignore
import me from "math-expressions";

/**
 * The interface for the subset-of-reals object.
 *
 * The interface is implemented for these types:
 * `invalid`, `empty`, `realLine`, `singleton`, `openInterval`, and `union`.
 *
 * The subsets of reals captured by `subset-of-reals` can be represented by those types,
 * where `union` is a union of singletons and open intervals.
 */
export namespace Interfaces {
    export interface SubsetMethods {
        union: (that: Subset) => Subset;
        intersectWithOpenInterval: (that: OpenInterval) => Subset;
        setMinus: (that: Subset) => Subset;
        symmetricDifference: (that: Subset) => Subset;
        complement: () => Subset;
        intersect: (that: Subset) => Subset;
        containsSubset: (that: Subset) => boolean;
        isSubsetOf: (that: Subset) => boolean;
        equals: (that: Subset) => boolean;
        containsElement: (element: number) => boolean;
        isEmpty: () => boolean;
        isValid: () => boolean;
        toJSON: () => any;
        toMathExpression: () => any;
        copy: () => Subset;
    }

    export interface InvalidSet extends SubsetMethods {
        type: "invalid";
    }
    export interface EmptySet extends SubsetMethods {
        type: "empty";
    }
    export interface RealLine extends SubsetMethods {
        type: "realLine";
    }
    export interface Singleton extends SubsetMethods {
        type: "singleton";
        element: number;
    }
    export interface OpenInterval extends SubsetMethods {
        type: "openInterval";
        left: number;
        right: number;
    }
    export interface Union extends SubsetMethods {
        type: "union";
        subsets: (Singleton | OpenInterval)[];
    }
    export type Subset =
        | InvalidSet
        | EmptySet
        | RealLine
        | Singleton
        | OpenInterval
        | Union;
}

export function isSubset(obj: unknown) {
    return (
        obj instanceof Constructors.InvalidSet ||
        obj instanceof Constructors.EmptySet ||
        obj instanceof Constructors.RealLine ||
        obj instanceof Constructors.Singleton ||
        obj instanceof Constructors.OpenInterval ||
        obj instanceof Constructors.Union
    );
}

/**
 * Helper functions for implementing methods of the interface
 * on the majority of subset types
 */
const genericMethods = {
    union: function (A: Interfaces.Subset, B: Interfaces.Subset) {
        return A.complement().intersect(B.complement()).complement();
    },

    intersectWithOpenInterval: function (
        A: Interfaces.Subset,
        B: Interfaces.OpenInterval,
    ): Interfaces.Subset {
        return A.intersect(B);
    },

    setMinus: function (
        A: Interfaces.Subset,
        B: Interfaces.Subset,
    ): Interfaces.Subset {
        return A.intersect(B.complement());
    },

    symmetricDifference: function (
        A: Interfaces.Subset,
        B: Interfaces.Subset,
    ): Interfaces.Subset {
        return A.setMinus(B).union(B.setMinus(A));
    },

    containsSubset: function (A: Interfaces.Subset, B: Interfaces.Subset) {
        return A.intersect(B).equals(B);
    },

    isSubsetOf: function (A: Interfaces.Subset, B: Interfaces.Subset) {
        return genericMethods.containsSubset(B, A);
    },

    equals: function (A: Interfaces.Subset, B: Interfaces.Subset) {
        return A.symmetricDifference(B).isEmpty();
    },
};

/**
 * Reviver function than can be used with `JSON.parse()` to revive a subset of reals
 * from the JSON object produced by the `.toJSON()` method.
 */
export function subsetReviver(_key: any, value: unknown): any {
    if (
        typeof value === "object" &&
        value !== null &&
        "objectType" in value &&
        value.objectType === "subset" &&
        "data" in value &&
        typeof value.data === "object" &&
        value.data !== null &&
        "type" in value.data &&
        value.data.type !== undefined
    ) {
        if (value.data.type === "empty") {
            return EmptySet();
        } else if (value.data.type === "realLine") {
            return RealLine();
        } else if (value.data.type === "singleton") {
            if (
                "element" in value.data &&
                typeof value.data.element === "number"
            ) {
                return Singleton(value.data.element);
            }
        } else if (value.data.type === "union") {
            if (
                "subsets" in value.data &&
                Array.isArray(value.data.subsets) &&
                value.data.subsets.every(
                    (s) =>
                        s instanceof Constructors.Singleton ||
                        s instanceof Constructors.OpenInterval,
                )
            ) {
                return Union(value.data.subsets);
            }
        } else if (value.data.type === "openInterval") {
            if (
                "left" in value.data &&
                typeof value.data.left === "number" &&
                "right" in value.data &&
                typeof value.data.right === "number"
            ) {
                return OpenInterval(value.data.left, value.data.right);
            }
        }
    }

    return value;
}

/**
 * The classes that implement the subset of real interface.
 */
const Constructors = {
    EmptySet: class implements Interfaces.EmptySet {
        type = "empty" as const;

        union(that: Interfaces.Subset) {
            return that;
        }
        intersectWithOpenInterval(that: Interfaces.OpenInterval) {
            return genericMethods.intersectWithOpenInterval(this, that);
        }
        setMinus(that: Interfaces.Subset) {
            return genericMethods.setMinus(this, that);
        }
        symmetricDifference(that: Interfaces.Subset) {
            return genericMethods.symmetricDifference(this, that);
        }
        containsSubset(that: Interfaces.Subset) {
            return genericMethods.containsSubset(this, that);
        }
        isSubsetOf(that: Interfaces.Subset) {
            return genericMethods.isSubsetOf(this, that);
        }
        equals(that: Interfaces.Subset) {
            return genericMethods.equals(this, that);
        }

        intersect(/* subset */) {
            return EmptySet();
        }

        containsElement(/* element */) {
            return false;
        }

        isEmpty() {
            return true;
        }

        complement() {
            return RealLine();
        }

        isValid() {
            return true;
        }

        toString() {
            return "∅";
        }

        toMathExpression() {
            return me.fromAst("emptyset");
        }

        toJSON() {
            return {
                objectType: "subset",
                data: { type: "empty" },
            };
        }

        copy() {
            return subsetReviver(null, this.toJSON());
        }
    },

    InvalidSet: class implements Interfaces.InvalidSet {
        type = "invalid" as const;

        intersectWithOpenInterval(that: Interfaces.OpenInterval) {
            return genericMethods.intersectWithOpenInterval(this, that);
        }
        setMinus(that: Interfaces.Subset) {
            return genericMethods.setMinus(this, that);
        }
        symmetricDifference(that: Interfaces.Subset) {
            return genericMethods.symmetricDifference(this, that);
        }
        containsSubset(that: Interfaces.Subset) {
            return genericMethods.containsSubset(this, that);
        }
        isSubsetOf(that: Interfaces.Subset) {
            return genericMethods.isSubsetOf(this, that);
        }
        equals(that: Interfaces.Subset) {
            return genericMethods.equals(this, that);
        }

        union(/* subset */) {
            return InvalidSet();
        }

        intersect(/* subset */) {
            return InvalidSet();
        }

        containsElement(/* element */) {
            return false;
        }

        isEmpty() {
            return true;
        }

        complement() {
            return InvalidSet();
        }

        isValid() {
            return false;
        }

        toString() {
            return "\uff3f";
        }

        toMathExpression() {
            return me.fromAst("\uff3f");
        }

        toJSON() {
            return {
                objectType: "subset",
                data: { type: "invalid" },
            };
        }

        copy() {
            return subsetReviver(null, this.toJSON());
        }
    },

    RealLine: class implements Interfaces.RealLine {
        type = "realLine" as const;

        intersectWithOpenInterval(that: Interfaces.OpenInterval) {
            return genericMethods.intersectWithOpenInterval(this, that);
        }
        setMinus(that: Interfaces.Subset) {
            return genericMethods.setMinus(this, that);
        }
        symmetricDifference(that: Interfaces.Subset) {
            return genericMethods.symmetricDifference(this, that);
        }
        containsSubset(that: Interfaces.Subset) {
            return genericMethods.containsSubset(this, that);
        }
        isSubsetOf(that: Interfaces.Subset) {
            return genericMethods.isSubsetOf(this, that);
        }
        equals(that: Interfaces.Subset) {
            return genericMethods.equals(this, that);
        }

        isValid() {
            return true;
        }

        union(/* that */): Interfaces.Subset {
            return RealLine();
        }

        intersect(that: Interfaces.Subset) {
            return that;
        }

        containsElement(/* element */) {
            return true;
        }

        complement(): Interfaces.Subset {
            return EmptySet();
        }

        isEmpty() {
            return false;
        }

        toString() {
            return "ℝ";
        }

        toMathExpression() {
            return me.fromAst("R");
        }

        toJSON() {
            return {
                objectType: "subset",
                data: { type: "realLine" },
            };
        }

        copy() {
            return subsetReviver(null, this.toJSON());
        }
    },

    Singleton: class implements Interfaces.Singleton {
        type = "singleton" as const;
        element: number;

        constructor(element: number) {
            this.element = element;
        }

        intersectWithOpenInterval(that: Interfaces.OpenInterval) {
            return genericMethods.intersectWithOpenInterval(this, that);
        }
        setMinus(that: Interfaces.Subset) {
            return genericMethods.setMinus(this, that);
        }
        symmetricDifference(that: Interfaces.Subset) {
            return genericMethods.symmetricDifference(this, that);
        }
        containsSubset(that: Interfaces.Subset) {
            return genericMethods.containsSubset(this, that);
        }
        isSubsetOf(that: Interfaces.Subset) {
            return genericMethods.isSubsetOf(this, that);
        }
        equals(that: Interfaces.Subset) {
            return genericMethods.equals(this, that);
        }

        isValid() {
            return true;
        }

        union(that: Interfaces.Subset) {
            if (that.containsElement(this.element)) {
                return that;
            } else {
                return Union([that, this]);
            }
        }

        intersect(subset: Interfaces.Subset): Interfaces.Subset {
            if (subset.containsElement(this.element)) {
                return Singleton(this.element);
            } else {
                return EmptySet();
            }
        }

        isEmpty() {
            return false;
        }

        containsElement(element: number) {
            return element === this.element;
        }

        complement(): Interfaces.Subset {
            return Union([
                OpenInterval(-Infinity, this.element),
                OpenInterval(this.element, Infinity),
            ]);
        }

        toString() {
            return `{${this.element}}`;
        }

        toMathExpression() {
            return me.fromAst(["set", this.element]);
        }

        toJSON() {
            return {
                objectType: "subset",
                data: { type: "singleton", element: this.element },
            };
        }

        copy() {
            return subsetReviver(null, this.toJSON());
        }
    },

    OpenInterval: class implements Interfaces.OpenInterval {
        type = "openInterval" as const;
        left: number;
        right: number;

        constructor(left: number, right: number) {
            this.left = left;
            this.right = right;
        }

        union(that: Interfaces.Subset) {
            return genericMethods.union(this, that);
        }

        setMinus(that: Interfaces.Subset) {
            return genericMethods.setMinus(this, that);
        }
        symmetricDifference(that: Interfaces.Subset) {
            return genericMethods.symmetricDifference(this, that);
        }
        containsSubset(that: Interfaces.Subset) {
            return genericMethods.containsSubset(this, that);
        }
        isSubsetOf(that: Interfaces.Subset) {
            return genericMethods.isSubsetOf(this, that);
        }
        equals(that: Interfaces.Subset) {
            return genericMethods.equals(this, that);
        }

        isValid() {
            return true;
        }

        intersect(subset: Interfaces.Subset) {
            return subset.intersectWithOpenInterval(this);
        }

        intersectWithOpenInterval(that: Interfaces.OpenInterval) {
            return OpenInterval(
                Math.max(this.left, that.left),
                Math.min(this.right, that.right),
            );
        }

        complement(): Interfaces.Subset {
            return Union([
                OpenClosedInterval(-Infinity, this.left),
                ClosedOpenInterval(this.right, Infinity),
            ]);
        }

        isEmpty() {
            return this.left >= this.right;
        }

        containsElement(element: number) {
            return element > this.left && element < this.right;
        }

        toString() {
            return `(${this.left.toString()},${this.right.toString()})`;
        }

        toMathExpression() {
            return me.fromAst([
                "interval",
                ["tuple", this.left, this.right],
                ["tuple", false, false],
            ]);
        }

        toJSON() {
            return {
                objectType: "subset",
                data: {
                    type: "openInterval",
                    left: this.left,
                    right: this.right,
                },
            };
        }

        copy() {
            return subsetReviver(null, this.toJSON());
        }
    },

    Union: class implements Interfaces.Union {
        type = "union" as const;
        subsets: (Interfaces.Singleton | Interfaces.OpenInterval)[];

        constructor(
            subsets: (Interfaces.Singleton | Interfaces.OpenInterval)[],
        ) {
            this.subsets = subsets;
        }

        union(that: Interfaces.Subset) {
            return genericMethods.union(this, that);
        }

        setMinus(that: Interfaces.Subset) {
            return genericMethods.setMinus(this, that);
        }
        symmetricDifference(that: Interfaces.Subset) {
            return genericMethods.symmetricDifference(this, that);
        }
        containsSubset(that: Interfaces.Subset) {
            return genericMethods.containsSubset(this, that);
        }
        isSubsetOf(that: Interfaces.Subset) {
            return genericMethods.isSubsetOf(this, that);
        }
        equals(that: Interfaces.Subset) {
            return genericMethods.equals(this, that);
        }

        isValid() {
            return true;
        }

        intersectWithOpenInterval(that: Interfaces.OpenInterval) {
            return this.intersect(that);
        }

        containsElement(element: number) {
            return this.subsets.some((s) => s.containsElement(element));
        }

        isEmpty() {
            return this.subsets.every((s) => s.isEmpty());
        }

        complement() {
            return this.subsets
                .map((s) => s.complement())
                .reduce((a, b) => a.intersect(b));
        }

        intersect(subset: Interfaces.Subset) {
            return Union(this.subsets.map((s) => subset.intersect(s)));
        }

        toString() {
            return this.subsets.map((s) => s.toString()).join(" U ");
        }

        toMathExpression() {
            return me.fromAst([
                "union",
                ...this.subsets.map((s) => s.toMathExpression().tree),
            ]);
        }

        toJSON() {
            return {
                objectType: "subset",
                data: {
                    type: "union",
                    subsets: this.subsets.map((s) => s.toJSON()),
                },
            };
        }

        copy() {
            return subsetReviver(null, this.toJSON());
        }
    },
};

//////////////////////////////////////////////////////////////////////////////
// The functions to create new instances of subset of reals objects.
// We provide these functions:
// `InvalidSet`, `EmptySet`, `RealLine`, `Singleton`, `OpenInterval`, `Union`,
// `ClosedInterval`, `OpenClosedInterval`, and `ClosedOpenInterval`.
//////////////////////////////////////////////////////////////////////////////

export function EmptySet(): Interfaces.Subset {
    return new Constructors.EmptySet();
}

export function InvalidSet(): Interfaces.Subset {
    return new Constructors.InvalidSet();
}

export function RealLine(): Interfaces.Subset {
    return new Constructors.RealLine();
}

export function Singleton(element: number): Interfaces.Subset {
    if (!Number.isFinite(element)) {
        return new Constructors.EmptySet();
    }
    return new Constructors.Singleton(element);
}

export function OpenInterval(left: number, right: number): Interfaces.Subset {
    if (!(left < right)) {
        return new Constructors.EmptySet();
    } else if (left === -Infinity && right === Infinity) {
        return new Constructors.RealLine();
    } else {
        return new Constructors.OpenInterval(left, right);
    }
}

export function Union(subsets: Interfaces.Subset[]): Interfaces.Subset {
    if (subsets.some((s) => s.type === "invalid")) {
        return new Constructors.InvalidSet();
    }

    // flatten
    const flattenedSubsets = (
        subsets as Exclude<Interfaces.Subset, Interfaces.InvalidSet>[]
    ).reduce<
        Exclude<Interfaces.Subset, Interfaces.Union | Interfaces.InvalidSet>[]
    >(
        (acc, val) =>
            val.type === "union" ? [...acc, ...val.subsets] : [...acc, val],
        [],
    );

    const filtered: (Interfaces.Singleton | Interfaces.OpenInterval)[] = [];

    for (const sub of flattenedSubsets) {
        if (sub.type === "realLine") {
            return new Constructors.RealLine();
        } else if (sub.type !== "empty" && !sub.isEmpty()) {
            filtered.push(sub);
        }
    }

    if (filtered.length === 0) {
        return new Constructors.EmptySet();
    }

    const newSubsets: (Interfaces.OpenInterval | Interfaces.Singleton)[] = [];

    for (let ind1 = 0; ind1 < filtered.length; ind1++) {
        let sub1 = filtered[ind1];
        let addSub1 = true;

        if (sub1.type === "openInterval") {
            let left = sub1.left;
            let right = sub1.right;

            for (let ind2 = ind1 + 1; ind2 < filtered.length; ind2++) {
                let sub2 = filtered[ind2];
                if (sub2.type === "openInterval") {
                    // two open intervals
                    if (left < sub2.right && sub2.left < right) {
                        // intervals overlap
                        left = Math.min(left, sub2.left);
                        right = Math.max(right, sub2.right);
                        filtered.splice(ind2, 1);
                        ind2--;

                        // stop processing sub2s and
                        // keep sub1 in the queue to be processed
                        // so that will catch passed singletons or intervals
                        // that overlap with the extension of sub1
                        addSub1 = false;
                        ind1--;
                        break;
                    } else if (left === sub2.right || right === sub2.left) {
                        // intervals just touch.  Check if there is a singleton
                        // to fill in the gap

                        let gap = left === sub2.right ? left : right;

                        // first check if already passed a singleton that fits the gap
                        let foundSingleton = false;
                        for (let ind3 = 0; ind3 < newSubsets.length; ind3++) {
                            let sub3 = newSubsets[ind3];
                            if (
                                sub3.type === "singleton" &&
                                sub3.element === gap
                            ) {
                                newSubsets.splice(ind3, 1);
                                foundSingleton = true;
                                break;
                            }
                        }

                        // then check if a future singleton fits the gap
                        if (!foundSingleton) {
                            for (
                                let ind3 = ind1 + 1;
                                ind3 < filtered.length;
                                ind3++
                            ) {
                                let sub3 = filtered[ind3];
                                if (
                                    sub3.type === "singleton" &&
                                    sub3.element === gap
                                ) {
                                    filtered.splice(ind3, 1);
                                    foundSingleton = true;
                                    if (ind3 < ind2) {
                                        // have to shift ind2 as splice an entry in front of it
                                        ind2--;
                                    }
                                    break;
                                }
                            }
                        }

                        if (foundSingleton) {
                            // merge intervals
                            left = Math.min(left, sub2.left);
                            right = Math.max(right, sub2.right);
                            filtered.splice(ind2, 1);
                            ind2--;

                            // stop processing sub2s and
                            // keep sub1 in the queue to be processed
                            // so that will catch passed singletons or intervals
                            // that overlap with the extension of sub1
                            addSub1 = false;
                            ind1--;
                            break;
                        }
                    }
                } else {
                    // open interval and singleton
                    if (sub2.element > left && sub2.element < right) {
                        // singleton is inside interval, delete it
                        filtered.splice(ind2, 1);
                        ind2--;
                    }
                }
            }

            sub1.left = left;
            sub1.right = right;

            if (sub1.left === -Infinity && sub1.right === Infinity) {
                return new Constructors.RealLine();
            }
        } else {
            // have singleton
            let val = sub1.element;

            for (let ind2 = ind1 + 1; ind2 < filtered.length; ind2++) {
                let sub2 = filtered[ind2];
                if (sub2.type === "openInterval") {
                    if (val > sub2.left && val < sub2.right) {
                        // point is inside interval, delete point
                        filtered.splice(ind1, 1);
                        ind1--;
                        addSub1 = false;
                        break;
                    }
                } else if (sub2.element === val) {
                    // duplicate point, delete duplicate
                    filtered.splice(ind2, 1);
                    ind2--;
                }
            }
        }

        if (addSub1) {
            newSubsets.push(sub1);
        }
    }

    if (newSubsets.length === 1) {
        return newSubsets[0];
    }

    return new Constructors.Union(newSubsets);
}

export function ClosedInterval(left: number, right: number): Interfaces.Subset {
    if (!(left <= right)) {
        return new Constructors.EmptySet();
    } else if (left === -Infinity && right === Infinity) {
        return new Constructors.RealLine();
    } else {
        const pieces: (Interfaces.Singleton | Interfaces.OpenInterval)[] = [
            new Constructors.OpenInterval(left, right),
        ];

        if (Number.isFinite(left)) {
            pieces.push(new Constructors.Singleton(left));
        }
        if (Number.isFinite(right)) {
            pieces.push(new Constructors.Singleton(right));
        }

        return Union(pieces);
    }
}

export function OpenClosedInterval(
    left: number,
    right: number,
): Interfaces.Subset {
    if (!(left < right)) {
        return new Constructors.EmptySet();
    } else if (left === -Infinity && right === Infinity) {
        return new Constructors.RealLine();
    } else {
        const pieces: (Interfaces.Singleton | Interfaces.OpenInterval)[] = [
            new Constructors.OpenInterval(left, right),
        ];

        if (Number.isFinite(right)) {
            pieces.push(new Constructors.Singleton(right));
        }

        return Union(pieces);
    }
}

export function ClosedOpenInterval(
    left: number,
    right: number,
): Interfaces.Subset {
    if (!(left < right)) {
        return new Constructors.EmptySet();
    } else if (left === -Infinity && right === Infinity) {
        return new Constructors.RealLine();
    } else {
        const pieces: (Interfaces.Singleton | Interfaces.OpenInterval)[] = [
            new Constructors.OpenInterval(left, right),
        ];

        if (Number.isFinite(left)) {
            pieces.push(new Constructors.Singleton(left));
        }

        return Union(pieces);
    }
}
