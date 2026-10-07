#!/usr/bin/env node

/**
 * Script to convert WebWork problems (written in Perl) to DoenetML
 * TODO: tables
 */

import fs from "node:fs";
import { pathToFileURL } from "node:url";

const tab = "  ";

export function convert(data) {
    // const sections = data.split(/#{4,}/);
    const documentMatch = data.match(/DOCUMENT\(\);(.*)ENDDOCUMENT\(\);/s);
    if (!documentMatch || documentMatch.length < 2) {
        console.warn(
            "Expected a 'DOCUMENT(); ... ENDDOCUMENT();' block, but none was found. Returning empty output.",
        );
        return "";
    }
    let document = documentMatch[1];

    // Remove comments
    document = document.replace(/\#.*/g, "");

    let content = "";
    let contentType = null;

    const findText = document.match(/BEGIN_TEXT(.*)END_TEXT/s);
    if (findText) {
        content = findText[1].trim();
        contentType = "text";
        document = document.replaceAll(/BEGIN_TEXT.*END_TEXT/gs, "");
    }

    const findPgml = document.match(/BEGIN_PGML(.*)END_PGML/s);
    if (findPgml) {
        if (contentType) {
            console.warn("Both TEXT and PGML found!!");
        }
        content = findPgml[1].trim();
        contentType = "pgml";
        document = document.replaceAll(/BEGIN_PGML.*END_PGML/gs, "");
    }

    if (!contentType) {
        console.warn("Neither TEXT nor PGML found");
        return "";
    }

    // Solution is always of type `text`
    let solutionSection = "";
    const findSolution = document.match(/SOLUTION.*;(.*)END_SOLUTION/s);
    if (findSolution) {
        solutionSection = findSolution[1].trim();
        document = document.replaceAll(/SOLUTION.*END_SOLUTION/gs, "");
    }

    // Arrays indexed by a random variable become a <select>
    let selects;
    [document, [content, solutionSection], selects] = convertIndexedArrays(
        document,
        [content, solutionSection],
    );

    // Perl subroutines (helpers, custom answer checkers) aren't converted
    let subroutineWarnings;
    [document, subroutineWarnings] = removeSubroutines(document);

    // Clean up the rest of the document a bit
    document = document.replace(/(\r\n)+/g, "\n");
    document = document.replace(/\n+/g, "\n");
    document = document.replace(/\r+/g, "\n");
    document = document.trim();

    // Split into statements

    document = document.replaceAll(";\n", ";");
    let statements = document.split(";").map((s) => s.trim());

    statements = statements.filter(
        (v) =>
            v !== "" &&
            !v.includes("loadMacros") &&
            !v.includes("beginproblem") &&
            !v.includes("Context(") &&
            !/install_\w*grader\(/.test(v),
    );

    function splitStatementOn(
        statements,
        keyword,
        splitOn,
        keepKeyword = false,
    ) {
        for (let i = statements.length - 1; i >= 0; i--) {
            if (statements[i].indexOf(keyword) === 0) {
                let splitId = statements[i].indexOf(splitOn);
                let beforEndId = keepKeyword
                    ? splitId + keyword.length
                    : splitId;
                let before = statements[i].slice(0, beforEndId);
                let after = statements[i].slice(splitId + 1);

                before = before.replace("==", "=");
                statements[i] = before;
                statements.splice(i + 1, 0, after);
            }
        }
        statements = statements.map((s) => s.trim());

        return statements;
    }

    statements = splitStatementOn(statements, "}", "}", true);
    statements = splitStatementOn(statements, "if", "{");
    statements = splitStatementOn(statements, "elsif", "{");
    statements = splitStatementOn(statements, "else", "{");

    // let out = "";
    let answers = [];
    let activeConditions = [];
    let prevCondition = "";

    // Keep track of graphs, we render them later
    let graphs = {};
    let graphContents = {};

    let setup = new Map();
    function addSetup(name, open, child, close, conditions) {
        // `child` is always math: the contents of a <math>, <number>, etc.
        child = spaceLessThan(child);

        let conditionText = "";
        for (let c of conditions) {
            if (c !== "while") {
                conditionText += c + " and ";
            }
        }
        conditionText = conditionText.slice(0, -5);

        let data = setup.get(name);
        if (data) {
            // Ignore open and close, add child option

            let childOptions = data.childOptions;
            childOptions.push({ value: child, condition: conditionText });

            setup.set(name, {
                open: data.open,
                childOptions: childOptions,
                close: data.close,
            });
        } else {
            // Use open and close and child
            let childOptions = [{ value: child, condition: conditionText }];
            setup.set(name, {
                open: open,
                childOptions: childOptions,
                close: close,
            });
        }
    }

    let out = subroutineWarnings;
    for (let select of selects) {
        out += select + "\n";
    }

    let graphicalStyleCount = 0; //styling for graphical objects
    for (let statement of statements) {
        let find;

        // Open conditional if
        if ((find = statement.match(/if\s*\((.*)\)/))) {
            let condition = find[1].trim();
            activeConditions.push(condition);

            // Open conditional else
        } else if (statement === "else") {
            activeConditions.push("else");

            // Open conditional: while
        } else if ((find = statement.match(/while\s*\((.*)\)/))) {
            out += warnAndComment("Not implemented: while statements");
            // let condition = find[1].trim();
            activeConditions.push("while");

            // Close conditional
        } else if (statement === "}") {
            prevCondition = activeConditions.pop();

            // == Variable declaration ===
            // Of the form $a = ...;
        } else if ((find = statement.match(/\$(\w+)\s*=(.*)/))) {
            const varName = find[1].trim();
            const varValue = find[2].trim();
            const findFunc = varValue.match(/(\w+)\((.*)\)(->\w+)?/);

            // Special case: init_graph()
            // Of the form $a = init_graph(...)...;
            if (findFunc && findFunc[1] === "init_graph") {
                graphs[varName] = graphOpenTag(findFunc[2]);

                // Function statement
                // Of the form $a = b(c)...;
            } else if (findFunc && findFunc.index === 0) {
                const [open, child, close, gStyle] = functionStatement(
                    varName,
                    findFunc[1],
                    findFunc[2],
                    graphicalStyleCount,
                );
                addSetup(varName, open, child, close, activeConditions);
                graphicalStyleCount = gStyle;

                // Special case: partial answers
                // Not needed: each answer blank becomes its own <answer>
            } else if (varName === "showPartialCorrectAnswers") {
                // Variable assignment, no function
            } else {
                // stick it in a math tag
                let open = `<math name="${varName}">`;
                let child = `${varValue}`;
                child = child.replaceAll(`"`, ``);
                let close = `</math>`;
                addSetup(varName, open, child, close, activeConditions);
            }

            // Special case: plot_functions
            // plot_functions(...);
        } else if ((find = statement.match(/plot_functions\((.*)\)/))) {
            const plotArgs = splitArgs(find[1]);
            let plotGraph = plotArgs.shift();
            plotGraph = plotGraph.slice(1); //remove $

            for (let child of plotArgs) {
                if (graphContents[plotGraph]) {
                    graphContents[plotGraph].push(child);
                } else {
                    graphContents[plotGraph] = [child];
                }
            }

            // Answers
            // Of the form ANS(...);
        } else if ((find = statement.match(/ANS\(\s*(.*)\s*\)/))) {
            let arg = find[1];

            let parts = arg.split("->");
            // Ignore extra parts for now
            // if(parts.length > 1) {
            //   if(find = parts[1].match(/cmp\((.*)\)/)) {
            //     let cmpArgs = splitArgs(find[1]);
            //     console.log(cmpArgs);
            //   }
            // }

            let ans = parts[0];

            if ((find = ans.match(/(\w+)\s*\(\s*(.*)\s*\)/))) {
                if (find[1] == "fun_cmp") {
                    ans = splitArgs(find[2])[0];
                } else {
                    const [open, child, close, gStyle] = functionStatement(
                        undefined,
                        find[1],
                        find[2],
                        graphicalStyleCount,
                    );
                    ans = open + child + close;
                }
            }

            answers.push(ans);

            // ERROR: unrecognized pattern
        } else {
            out += warnAndComment(`Unrecognized pattern: ${statement}`);
        }
    }

    for (let data of setup.values()) {
        out += data.open;

        let options = data.childOptions;
        if (options.length === 1 && options[0].condition === "") {
            out += options[0].value;
        } else {
            out += `<conditionalContent>\n`;
            for (let option of options) {
                if (option.condition === "else") {
                    //TODO: bug with else nested inside if
                    out += `${tab}<else>${option.value}</else>\n`;
                } else {
                    out += `${tab}<case condition="${escapeAttribute(option.condition)}">${option.value}</case>\n`;
                }
            }
            out += `</conditionalContent>`;
        }

        out += data.close + "\n";
    }

    out = tab + out;
    out = out.replaceAll("\n", `\n${tab}`);
    out = out.slice(0, -tab.length);
    out = `<setup>\n` + out + `</setup>\n\n`;

    // out = out.replaceAll(/<setup>(.*)\n(.*)<\/setup>/gs, `<setup>$1\n${tab}$2</setup>`);

    // ==== PARSE TEXT/PGML =====
    // Each answer blank becomes an inline <answer>; record what we emitted
    // so the <givenAnswer> can list them.
    let answerRecords = [];
    let textOut;
    if (contentType === "text") {
        // TEXT
        if (answers.length === 0) {
            out += warnAndComment("No answers found in problem");
        }
        textOut = textSection(
            content,
            answers,
            answerRecords,
            graphs,
            graphContents,
        );
        if (answerRecords.length !== answers.length) {
            out += warnAndComment(
                `Found ${answerRecords.length} answer blanks but ${answers.length} ANS() calls`,
            );
        }
    } else {
        // PGML
        textOut = pgmlSection(content, answerRecords);
    }
    out += textOut;

    // THE ANSWER AND SOLUTION
    let givenAnswerOut = "";
    for (let { lhs, answer } of answerRecords) {
        if (answer === undefined) {
            continue;
        }
        if (answer.startsWith("<")) {
            const lhsOut = lhs ? `<m>${lhs} =</m> ` : "";
            givenAnswerOut += `${tab}<p>${lhsOut}${answer}</p>\n`;
        } else {
            const lhsOut = lhs ? `${lhs} = ` : "";
            givenAnswerOut += `${tab}<p><m>${lhsOut}${answer}</m></p>\n`;
        }
    }
    if (givenAnswerOut) {
        out += `\n<givenAnswer>\n${givenAnswerOut}</givenAnswer>\n`;
    }

    if (solutionSection) {
        const solutionOut = textSection(
            solutionSection,
            [],
            [],
            graphs,
            graphContents,
        );
        out += `\n<solution>\n${solutionOut}</solution>\n`;
    }

    out = headerComment(data) + "<problem><title />\n" + out;
    out += "</problem>\n";

    return out;
}

/**
 * WeBWorK problems often pick a variant with `$n = random(0,k,1)` and then
 * index parallel arrays with it:
 *
 *     @var = ("h", "\(r^2\)");
 *     @answer = (Formula("(3V)/(pi*r^2)"), Formula("(3V)/(pi*h)"));
 *     ... $var[$n] ... $answer[$n] ...
 *
 * Convert that pattern to a <select> whose options each define one entry
 * from every array, and rewrite `$var[$n]` as `$s1.var`.
 *
 * Arrays that don't fit the pattern are left alone (and later reported as
 * unrecognized).
 *
 * @param {string} document - the Perl code, with TEXT/PGML/SOLUTION removed
 * @param {string[]} texts - TEXT/PGML/SOLUTION sections, also rewritten
 * @returns {[string, string[], string[]]} [document, texts, selects]
 */
function convertIndexedArrays(document, texts) {
    // Array declarations: @name = (...);
    let arrays = new Map();
    const declRegex = /@(\w+)\s*=\s*\(/g;
    let find;
    while ((find = declRegex.exec(document))) {
        const openId = find.index + find[0].length - 1;
        const closeId = findClosing(document, openId);
        if (closeId === -1) {
            continue;
        }
        const semicolon = document.slice(closeId + 1).match(/^\s*;/);
        const endId = closeId + 1 + (semicolon ? semicolon[0].length : 0);
        arrays.set(find[1], {
            elements: splitTopLevel(document.slice(openId + 1, closeId)),
            statement: document.slice(find.index, endId),
        });
    }

    // Uses of the form $array[$index], grouped by index variable
    const allCode = [document, ...texts].join("\n");
    let indexUses = new Map();
    for (let use of allCode.matchAll(/\$(\w+)\[\s*\$(\w+)\s*\]/g)) {
        const [, arrayName, indexVar] = use;
        if (!indexUses.has(indexVar)) {
            indexUses.set(indexVar, new Set());
        }
        indexUses.get(indexVar).add(arrayName);
    }

    let selects = [];
    for (let [indexVar, arrayNameSet] of indexUses) {
        // In the order they were declared
        const arrayNames = [...arrays.keys()].filter((name) =>
            arrayNameSet.has(name),
        );
        if (arrayNames.length !== arrayNameSet.size) {
            continue;
        }

        // The index must be random(0, k) or random(0, k, 1)...
        const randomMatch = document.match(
            new RegExp(String.raw`\$${indexVar}\s*=\s*random\(([^;]*)\)\s*;`),
        );
        if (!randomMatch) {
            continue;
        }
        const [from, to, step = "1"] = splitTopLevel(randomMatch[1]);
        const numOptions = Number(to) + 1;
        if (from !== "0" || step !== "1" || !Number.isInteger(numOptions)) {
            continue;
        }

        // ...every array it indexes must have k+1 entries...
        if (
            !arrayNames.every(
                (name) => arrays.get(name)?.elements.length === numOptions,
            )
        ) {
            continue;
        }

        // ...and neither the index nor the arrays can be used any other way
        const refRegex = new RegExp(
            String.raw`\$(${arrayNames.join("|")})\[\s*\$${indexVar}\s*\]`,
            "g",
        );
        const otherCode = allCode
            .replace(randomMatch[0], "")
            .replaceAll(refRegex, "");
        const otherUse = new RegExp(
            String.raw`\$${indexVar}\b|[$@](${arrayNames.join("|")})\b`,
        );
        if (
            otherUse.test(
                arrayNames.reduce(
                    (code, name) =>
                        code.replace(arrays.get(name).statement, ""),
                    otherCode,
                ),
            )
        ) {
            continue;
        }

        const selectName = `s${selects.length + 1}`;
        let select = `<select name="${selectName}">\n`;
        for (let i = 0; i < numOptions; i++) {
            select += `${tab}<option>\n`;
            for (let name of arrayNames) {
                const element = arrays.get(name).elements[i];
                select += `${tab}${tab}${arrayElement(name, element)}\n`;
            }
            select += `${tab}</option>\n`;
        }
        select += `</select>`;
        selects.push(select);

        document = document.replace(randomMatch[0], "");
        for (let name of arrayNames) {
            document = document.replace(arrays.get(name).statement, "");
        }

        // Wrap the reference in $(...) if a letter, digit, etc. follows it
        const rewrite = (code) =>
            code.replaceAll(refRegex, (match, name, offset, string) => {
                const next = string.slice(offset + match.length);
                return /^(\w|\.\w|\[)/.test(next)
                    ? `$(${selectName}.${name})`
                    : `$${selectName}.${name}`;
            });
        document = rewrite(document);
        texts = texts.map(rewrite);
    }

    return [document, texts, selects];
}

/**
 * Replace Perl subroutines with a single warning each, rather than letting
 * every statement in their body show up as an unrecognized pattern.
 *
 * - Named subroutines (`sub bold {...}`) are removed.
 * - Anonymous ones (`checker => sub {...}`, usually custom answer checkers)
 *   are replaced by `sub {}` so the surrounding statement still parses.
 *
 * @returns {[string, string]} [document, warning comments]
 */
function removeSubroutines(document) {
    let warnings = "";
    const subRegex = /\bsub\b\s*(\w*)\s*\{/g;
    let find;
    while ((find = subRegex.exec(document))) {
        const openId = find.index + find[0].length - 1;
        const closeId = findClosing(document, openId, "{", "}");
        if (closeId === -1) {
            break;
        }
        const name = find[1];
        let replacement;
        if (name) {
            warnings += warnAndComment(
                `Not converted: Perl subroutine \`${name}\``,
            );
            const semicolon = document.slice(closeId + 1).match(/^\s*;/);
            replacement = semicolon ? "" : ";";
            document =
                document.slice(0, find.index) +
                replacement +
                document.slice(closeId + 1 + (semicolon?.[0].length ?? 0));
        } else {
            warnings += warnAndComment(
                "Not converted: custom answer checker (anonymous Perl subroutine); check the answer by hand",
            );
            replacement = "sub {}";
            document =
                document.slice(0, find.index) +
                replacement +
                document.slice(closeId + 1);
        }
        subRegex.lastIndex = find.index + replacement.length;
    }
    return [document, warnings];
}

// Words that can appear in a math expression, so don't mean "this is text"
const mathWords = new Set(
    "sin cos tan sec csc cot arcsin arccos arctan sinh cosh tanh log ln exp sqrt abs pi inf infinity".split(
        " ",
    ),
);

/**
 * Convert one element of a Perl array to a named DoenetML component
 */
function arrayElement(name, element) {
    const findFunc = element.match(/^(\w+)\(([\s\S]*)\)$/);
    if (findFunc) {
        const [open, child, close] = functionStatement(
            name,
            findFunc[1],
            findFunc[2],
            0,
        );
        return open + child + close;
    }

    let value = element.replace(/^(["'])([\s\S]*)\1$/, "$2").trim();
    const findTex =
        value.match(/^\\\(([\s\S]*)\\\)$/) ??
        value.match(/^\\\[([\s\S]*)\\\]$/);
    if (findTex) {
        value = findTex[1].trim();
    }

    if (value.includes("\\")) {
        return `<math name="${name}" format="latex">${spaceLessThan(value)}</math>`;
    }
    if (/^-?\d+(\.\d+)?$/.test(value)) {
        return `<number name="${name}">${value}</number>`;
    }
    const words = value.match(/[A-Za-z]{3,}/g) ?? [];
    if (!findTex && words.some((w) => !mathWords.has(w.toLowerCase()))) {
        return `<text name="${name}">${spaceLessThan(value)}</text>`;
    }
    return `<math name="${name}">${spaceLessThan(value)}</math>`;
}

/**
 * Build a header comment from the WeBWorK metadata tags
 * (`## Author(...)`, `## DESCRIPTION ... ## ENDDESCRIPTION`)
 */
function headerComment(data) {
    const author = data.match(/##\s*Author\s*\(\s*'?([^')]*?)'?\s*\)/i)?.[1];

    let description = "";
    const findDescription = data.match(
        /##\s*DESCRIPTION(.*?)##\s*ENDDESCRIPTION/is,
    );
    if (findDescription) {
        description = findDescription[1]
            .split(/\r?\n/)
            .map((line) => line.replace(/^\s*#+/, "").trim())
            .filter((line) => line !== "")
            .join(" ");
    }

    const stars = "*".repeat(60);
    return `<!--${stars}
Author: ${commentSafe(author || "Unknown")} - WeBWorK OPL
Reviewed/Remixed by:

About the problem: ${commentSafe(description)}
${stars}-->
`;
}

/**
 *
 * @param {string} name - variable name, no $
 * @param {string} func -
 * @param {string} argsString - everything between parenthesis
 * @returns
 */
function functionStatement(name, func, argsString, graphicalStyleCount) {
    let args = splitArgs(argsString);

    let nameStr = name ? ` name="${name}"` : "";

    let open = "";
    let child = "";
    let close = "";
    if (func === "random") {
        // <selectFromSequence>
        let step =
            args[2] === "1" || args[2] === undefined
                ? ""
                : ` step="${args[2]}"`;
        open = `<selectFromSequence${nameStr} from="${args[0]}" to="${args[1]}"${step}/>`;
    } else if (func === "non_zero_random") {
        // <selectFromSequence>, exclude 0
        let step = args[2] === "1" ? "" : ` step="${args[2]}"`;
        open = `<selectFromSequence${nameStr} from="${args[0]}" to="${args[1]}"${step} exclude="0"/>`;
    } else if (func === "Real") {
        // <number>
        open = `<number${nameStr}>`;
        child = `${args[0]}`;
        close = "</number>";
    } else if (func === "Compute") {
        // <math>
        open = `<math${nameStr} simplify="full">`;
        child = `${args[0]}`;
        close = "</math>";
    } else if (func === "ImplicitPlane" || func === "Formula") {
        // <math> with equation
        open = `<math${nameStr} simplify="numbersPreserveOrder">`;
        child = `${args[0]}`;
        close = `</math>`;
    } else if (func === "List") {
        // <mathList>
        open = `<mathList${nameStr}>`;
        let list = "";
        for (let arg of args) {
            list += arg + " ";
        }
        list = list.slice(0, -1);
        child = list;
        close = `</mathList>`;
    } else if (func === "Interval") {
        // <interval>
        open = `<math${nameStr}><interval>`;
        child = `${args[0]}`;
        close = `</interval></math>`;
    } else if (func === "Union") {
        // <interval> with union
        args[0] = args[0].replaceAll(/\s+U\s+/g, " union ");
        open = `<math${nameStr}><interval>`;
        child = `${args[0]}`;
        close = `</interval></math>`;
    } else if (func === "FEQ") {
        // <function>
        graphicalStyleCount++;
        let funcDef = args[0].match(/(.*)\sfor\sx\sin\s<(.*),(.*)>/);
        if (funcDef) {
            open = `<function${nameStr} domain="[${funcDef[2]},${funcDef[3]}]" stylenumber="${graphicalStyleCount}">`;
            child = `${funcDef[1]}`;
            close = `</function>`;
        } else {
            open = warnAndComment(
                `FEQ function does not match expected pattern: ${args[0]}`,
            );
        }
    } else {
        open = warnAndComment(`Unknown function ${func}`);
    }

    return [open, child, close, graphicalStyleCount];
}

/**
 * Convert init_graph line
 */
function graphOpenTag(argsString) {
    let args = splitArgs(argsString);

    const xmin = args[0];
    const ymin = args[1];
    const xmax = args[2];
    const ymax = args[3];

    return `<graph xmin="${xmin}" xmax="${xmax}" ymin="${ymin}" ymax="${ymax}" grid="1 1">`;
}

function graphWithContents(graphName, graphs, graphContents) {
    const graphTag = graphs[graphName];
    let out = graphTag + "\n";
    if (graphContents[graphName]) {
        for (let child of graphContents[graphName]) {
            out += tab + child + "\n";
        }
    }
    out += "</graph>\n";
    return out;
}

/**
 * @param {string} text - contents of BEGIN_TEXT ... END_TEXT
 * @param {string[]} answers - correct answers, from the ANS() calls, in order
 * @param {object[]} answerRecords - each answer blank found is pushed here
 */
function textSection(text, answers, answerRecords, graphs, graphContents) {
    let out = "";

    text = text.replaceAll("\r\n", "");
    text = text.replaceAll("\n", "");
    text = text.replaceAll("\r", "");

    // Bold text: <alert>
    text = text.replaceAll("$BBOLD", "<alert>");
    text = text.replaceAll("${BBOLD}", "<alert>");
    text = text.replaceAll("$EBOLD", "</alert>");
    text = text.replaceAll("${EBOLD}", "</alert>");
    // Italic text: <em>
    text = text.replaceAll("$BITALIC", "<em>");
    text = text.replaceAll("${BITALIC}", "<em>");
    text = text.replaceAll("$EITALIC", "</em>");
    text = text.replaceAll("${EITALIC}", "</em>");
    // Centering
    text = text.replaceAll("$BCENTER", "");
    text = text.replaceAll("${BCENTER}", "");
    text = text.replaceAll("$ECENTER", "");
    text = text.replaceAll("${ECENTER}", "");
    // <m>, <me> and <md> tags
    text = convertTex(text);
    // Any unmatched delimiters left over
    text = text.replaceAll("\\(", "<m>");
    text = text.replaceAll("\\)", "</m>");
    text = text.replaceAll("\\[", "<me>");
    text = text.replaceAll("\\]", "</me>");

    // $PAR and $BR
    text = text.replaceAll("$PAR", "\n");
    text = text.replaceAll("${PAR}", "\n");
    text = text.replaceAll("$BR", "\n");
    text = text.replaceAll("${BR}", "\n");
    text = text.replaceAll("$HR", "\n");
    text = text.replaceAll("${HR}", "\n");

    text = text.trim();

    for (let par of text.split("\n")) {
        // <answer> tags
        par = insertAnswers(
            par,
            /\\?\{\s?ans_rule\(\s?\d+\s?\)\s?\\\}?/g,
            () => answers[answerRecords.length],
            answerRecords,
        );

        // <graph> tags
        const insertGraphMatches = par.matchAll(
            /\\\{\s*image\(\s*insertGraph\(\s*(.*)\s*\),.*\)\\\}/dg,
        );
        let matchIds = [];
        let graphNames = [];
        for (let match of insertGraphMatches) {
            matchIds.push(match.indices[0]);
            graphNames.push(match[1].slice(1));
        }
        // Start from the back so we don't mess up the earlier indices
        for (let i = matchIds.length - 1; i >= 0; i--) {
            let matchId = matchIds[i];
            let graphName = graphNames[i];
            const before = par.slice(0, matchId[0]);
            const after = par.slice(matchId[1], par.length);
            const graphOut = graphWithContents(
                graphName,
                graphs,
                graphContents,
            );
            par = before + graphOut + after;
        }

        // wrap it in a <p> tag
        out += `<p>${par.trim()}</p>\n`;
    }
    return out;
}

/**
 * Convert TeX math in a TEXT section:
 *   \( ... \)  -> <m>
 *   \[ ... \]  -> <me>, or <md> if it's just an aligned environment
 *   \begin{align} ... \end{align} (and align*, eqnarray) -> <md>
 *
 * Must be called on a single line: <md> output is kept on one line so it
 * stays inside its paragraph.
 */
function convertTex(text) {
    const regex = new RegExp(
        [
            String.raw`\\\[([\s\S]*?)\\\]`,
            String.raw`\\begin\{(align\*?|eqnarray\*?)\}([\s\S]*?)\\end\{\2\}`,
            String.raw`\\\(([\s\S]*?)\\\)`,
        ].join("|"),
        "g",
    );
    return text.replace(regex, (match, display, env, envBody, inline) => {
        if (inline !== undefined) {
            return `<m>${spaceLessThan(inline)}</m>`;
        }
        if (env !== undefined) {
            return alignedToMd(env, envBody);
        }
        const findAligned = display
            .trim()
            .match(
                /^\\begin\{(aligned|align\*?|eqnarray\*?)\}([\s\S]*)\\end\{\1\}$/,
            );
        if (findAligned) {
            return alignedToMd(findAligned[1], findAligned[2]);
        }
        return `<me>${spaceLessThan(display)}</me>`;
    });
}

/**
 * Rows of an aligned environment (separated by `\\`) become <mrow>s.
 * The `&` marking the alignment point is kept: it works the same in <mrow>.
 */
function alignedToMd(env, body) {
    let rows = body
        .split(/\\\\/)
        .map((row) => row.replaceAll(/\\(nonumber|notag)\b/g, "").trim())
        .filter((row) => row !== "");
    if (env.startsWith("eqnarray")) {
        // eqnarray marks both sides of the relation: `x &=& 5` -> `x &= 5`
        rows = rows.map((row) => row.replace(/&([^&]*)&/, "&$1"));
    }
    const mrows = rows.map((row) => `<mrow>${spaceLessThan(row)}</mrow>`);
    return `<md>${mrows.join("")}</md>`;
}

/**
 * Replace each answer blank matched by `regex` in `par` with an <answer>.
 * Text like `x =` (or `<m>x</m> =`) just before the blank becomes the
 * answer's <label>.
 */
function insertAnswers(par, regex, getAnswer, answerRecords) {
    let out = "";
    let lastId = 0;
    for (let match of par.matchAll(regex)) {
        const answer = getAnswer(match);
        let before = par.slice(lastId, match.index);
        lastId = match.index + match[0].length;

        const findLabel =
            before.match(/<m>([^<]*?)\s*=\s*<\/m>\s*$/) ??
            before.match(/<m>([^<]*)<\/m>\s*=\s*$/) ??
            before.match(/([^\s<>=]+)\s*=\s*$/);
        let lhs = null;
        let label = "";
        if (findLabel) {
            lhs = findLabel[1].trim();
            label = `<label><m>${lhs} = </m></label>`;
            before = before.slice(0, findLabel.index);
        }

        answerRecords.push({ lhs, answer });
        const name = `ans${answerRecords.length}`;
        if (answer === undefined) {
            out += before + warnAndComment(`No correct answer for ${name}`);
            out += `<answer name="${name}">${label}</answer>`;
        } else {
            out += `${before}<answer name="${name}">${label}${answer}</answer>`;
        }
    }
    return out + par.slice(lastId);
}

function pgmlSection(pgml, answerRecords) {
    // <m> tags with \displaystyle
    pgml = pgml.replaceAll(
        /\[``([\s\S]*?)``\]/g,
        (match, tex) => `<m>\\displaystyle{${spaceLessThan(tex)}}</m>`,
    );
    // <m> tags
    pgml = pgml.replaceAll(
        /\[`([\s\S]*?)`\]/g,
        (match, tex) => `<m>${spaceLessThan(tex)}</m>`,
    );

    // references
    pgml = pgml.replaceAll(/\[(\$\w+)\]/g, "$1");

    // paragraph breaks
    pgml = pgml.replaceAll("\n\n", "⛓️‍💥");
    pgml = pgml.replaceAll("\r\n\r\n", "⛓️‍💥");
    pgml = pgml.replaceAll("\r\r", "⛓️‍💥");

    let out = "";
    for (let par of pgml.split("⛓️‍💥")) {
        par = insertAnswers(
            par,
            /\[_+\]\{(.*?)\}/g,
            (match) => match[1],
            answerRecords,
        );

        out += `<p>${par.trim()}\n</p>\n`;
    }
    return out;
}

function splitArgs(argsString) {
    argsString = argsString.replace(/<(.*),(.*)>/, "<$1🍩$2>");
    argsString = argsString.replace(/\((.*),(.*)\)/, "($1🍩$2)");

    let args = argsString
        .split(",")
        .map((arg) => arg.trim().replaceAll(`"`, ``));
    args = args.map((a) => a.replace("🍩", ","));
    return args;
}

/**
 * Given `str[openId] === open`, return the index of the matching `close`,
 * skipping over quoted strings. Returns -1 if there is none.
 */
function findClosing(str, openId, open = "(", close = ")") {
    let depth = 0;
    let quote = null;
    for (let i = openId; i < str.length; i++) {
        const c = str[i];
        if (quote) {
            if (c === "\\") {
                i++;
            } else if (c === quote) {
                quote = null;
            }
        } else if (c === `"` || c === `'`) {
            quote = c;
        } else if (c === open) {
            depth++;
        } else if (c === close) {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
    }
    return -1;
}

/**
 * Split on commas that aren't inside quotes or brackets
 */
function splitTopLevel(str) {
    let parts = [];
    let depth = 0;
    let quote = null;
    let startId = 0;
    for (let i = 0; i < str.length; i++) {
        const c = str[i];
        if (quote) {
            if (c === "\\") {
                i++;
            } else if (c === quote) {
                quote = null;
            }
        } else if (c === `"` || c === `'`) {
            quote = c;
        } else if ("([{".includes(c)) {
            depth++;
        } else if (")]}".includes(c)) {
            depth--;
        } else if (c === "," && depth === 0) {
            parts.push(str.slice(startId, i).trim());
            startId = i + 1;
        }
    }
    parts.push(str.slice(startId).trim());
    return parts.filter((part) => part !== "");
}

/**
 * DoenetML reads `<` as a less-than sign when a space or `=` follows it,
 * but as the start of a tag otherwise (`x<0`, `a<b`). Add the space.
 * Only use on math, never on text that may contain tags.
 */
function spaceLessThan(math) {
    return math.replace(/<(?![\s=])/g, "< ");
}

/**
 * Attribute values only need their quotes escaped; `<` and `&` are fine
 */
function escapeAttribute(str) {
    return str.replaceAll(`"`, "&quot;");
}

/**
 * XML comments can't contain `--`
 */
function commentSafe(str) {
    return str.replace(/-(?=-)/g, "- ");
}

function warnAndComment(message) {
    console.warn(message);
    return `<!-- ${commentSafe(message)} -->\n`;
}

/**
 * Usage: node convert.js [input.pg] [output.doenetml] [hide-original]
 */
export function main(args = process.argv.slice(2)) {
    const hideOriginal = args.includes("hide-original");

    const [inputFilepath = "input.pg", outputFilepath = "output.doenetml"] =
        args.filter((arg) => arg !== "hide-original");
    let data = "";
    try {
        data = fs.readFileSync(inputFilepath, "utf8");
    } catch (err) {
        console.error("Error reading file:", err);
        return;
    }

    let output = convert(data);
    if (!hideOriginal) {
        output += `
<!-- Generated from this WeBWorK problem: -->
<!--\n${commentSafe(data)}\n-->\n`;
    }

    try {
        fs.writeFileSync(outputFilepath, output);
    } catch (err) {
        console.error("Error writing output", err);
    }
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    main();
}
