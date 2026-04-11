/**
 * XmlParser — port + fast-xml-parser adapter.
 *
 * fast-xml-parser ships both CJS and ESM, so a plain static import
 * works. We construct one parser at module load and reuse it —
 * parsing is stateless and cheap.
 *
 * Config:
 *  - `ignoreAttributes: false` so we get `link.href` on Atom entries
 *  - `attributeNamePrefix: ''` so attributes read as `x.href` not `x['@_href']`
 *  - `parseTagValue` / `parseAttributeValue` for typed values
 *  - `trimValues` so whitespace inside tags doesn't leak into chunks
 *  - `cdataPropName: '#cdata'` so CDATA blocks survive on a known key
 */

import { XMLParser as FxpParser } from 'fast-xml-parser';
import { Result, err, ok } from 'neverthrow';
import { GraphError } from '../../domain/errors.js';

/** Port. */
export interface XmlParserPort {
  parse(xml: string, source: string): Result<unknown, GraphError>;
}

const parser = new FxpParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '#text',
  parseTagValue: true,
  parseAttributeValue: true,
  trimValues: true,
  cdataPropName: '#cdata',
  htmlEntities: true,
  // Simon Willison's Atom feed has ~1700 HTML entities in full-content
  // entries. fast-xml-parser defaults to maxTotalExpansions=1000 which
  // is too low for real-world blog feeds. 10k is generous and still safe.
  processEntities: {
    enabled: true,
    maxTotalExpansions: 10_000,
  },
});

export const xmlParser = (): XmlParserPort => {
  const parse = (xml: string, source: string): Result<unknown, GraphError> => {
    try {
      return ok(parser.parse(xml));
    } catch (e) {
      return err(GraphError.parseError(source, `xml parse failed: ${(e as Error).message}`));
    }
  };
  return { parse };
};
