## Setup

This tool now lives inside the DoenetML monorepo at `packages/webwork-to-doenetml`.

Make sure you have Node installed: `node -v`

## Usage

Paste the WeBWorK Perl code into `packages/webwork-to-doenetml/input.pg`.

From the repository root, run:

`npm run convert -w packages/webwork-to-doenetml`

That writes the converted output to `packages/webwork-to-doenetml/output.doenetml`.

If you don't want to include the original WeBWorK problem in the generated output, run:

`npm run convert -w packages/webwork-to-doenetml -- hide-original`

You can also run the package locally from inside `packages/webwork-to-doenetml` with:

`npm run convert`

To convert a specific file instead of `input.pg`, pass the input (and optionally output) path:

`node convert.js path/to/problem.pg path/to/problem.doenetml`

## Output

- The problem is wrapped in `<problem>`, preceded by a header comment built from the WeBWorK `## Author(...)` and `## DESCRIPTION` tags.
- Each answer blank becomes an inline `<answer>` holding its correct answer. Text like `x =` just before the blank becomes the answer's `<label>`.
- The correct answers are listed in a `<givenAnswer>`. A WeBWorK `SOLUTION` section becomes a `<solution>`.
- Parallel arrays indexed by a random variable (`$n = random(0,k,1)` with `$var[$n]`, `$answer[$n]`) become a `<select>` with one `<option>` per variant, referenced as `$s1.var`, `$s1.answer`.
