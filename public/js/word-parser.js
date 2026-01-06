/**
 * Enhanced Word Parser Module v2.0
 * Hỗ trợ nâng cao cho việc đọc file .docx
 * 
 * Features:
 * - Đọc OOXML trực tiếp (thay vì chỉ dùng Mammoth.js)
 * - Hỗ trợ OMML (Office Math Markup Language) → KaTeX
 * - Giữ nguyên cấu trúc bảng
 * - Xử lý ảnh thông minh
 * - Nhận diện câu hỏi tự động
 */

const WordParser = (function () {
    'use strict';

    // === CONFIGURATION ===
    const CONFIG = {
        cloudinary: {
            cloudName: 'dfprmep2p',
            uploadPreset: 'up2web',
            transforms: 'q_auto,f_auto,h_200'
        },
        imageMaxWidth: 600,
        imageQuality: 0.85
    };

    // === OMML TO LATEX CONVERTER ===
    const OmmlToLatex = {
        /**
         * Convert OMML (Office Math Markup Language) to LaTeX
         * @param {Element} ommlElement - The OMML XML element
         * @returns {string} LaTeX string
         */
        convert: function (ommlElement) {
            if (!ommlElement) return '';

            try {
                return this.processNode(ommlElement);
            } catch (error) {
                console.warn('OMML conversion error:', error);
                return ommlElement.textContent || '';
            }
        },

        processNode: function (node) {
            if (!node) return '';

            // Handle text nodes
            if (node.nodeType === Node.TEXT_NODE) {
                return this.escapeLatex(node.textContent);
            }

            const tagName = node.localName || node.nodeName.replace(/^[^:]+:/, '');

            switch (tagName) {
                case 'oMath':
                case 'oMathPara':
                    return this.processChildren(node);

                case 'r': // Run
                    return this.processRun(node);

                case 'f': // Fraction
                    return this.processFraction(node);

                case 'rad': // Radical/Square root
                    return this.processRadical(node);

                case 'sSup': // Superscript
                    return this.processSuperscript(node);

                case 'sSub': // Subscript
                    return this.processSubscript(node);

                case 'sSubSup': // Sub-superscript
                    return this.processSubSuperscript(node);

                case 'nary': // N-ary (sum, integral, etc)
                    return this.processNary(node);

                case 'd': // Delimiter (parentheses, brackets)
                    return this.processDelimiter(node);

                case 'm': // Matrix
                    return this.processMatrix(node);

                case 'func': // Function
                    return this.processFunction(node);

                case 'acc': // Accent
                    return this.processAccent(node);

                case 'bar': // Bar
                    return this.processBar(node);

                case 'eqArr': // Equation array
                    return this.processEqArray(node);

                case 'limLow': // Lower limit
                    return this.processLimLow(node);

                case 'limUpp': // Upper limit
                    return this.processLimUpp(node);

                case 't': // Text
                    return this.escapeLatex(node.textContent || '');

                default:
                    return this.processChildren(node);
            }
        },

        processChildren: function (node) {
            let result = '';
            for (const child of node.childNodes) {
                result += this.processNode(child);
            }
            return result;
        },

        processRun: function (node) {
            const textNode = node.querySelector('t');
            if (textNode) {
                let text = textNode.textContent || '';

                // Handle special characters and functions
                const funcMap = {
                    'sin': '\\sin',
                    'cos': '\\cos',
                    'tan': '\\tan',
                    'cot': '\\cot',
                    'log': '\\log',
                    'ln': '\\ln',
                    'lim': '\\lim',
                    'max': '\\max',
                    'min': '\\min',
                    'exp': '\\exp',
                    'arcsin': '\\arcsin',
                    'arccos': '\\arccos',
                    'arctan': '\\arctan'
                };

                if (funcMap[text]) {
                    return funcMap[text] + ' ';
                }

                // Handle Greek letters
                const greekMap = {
                    'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta',
                    'ε': '\\epsilon', 'ζ': '\\zeta', 'η': '\\eta', 'θ': '\\theta',
                    'ι': '\\iota', 'κ': '\\kappa', 'λ': '\\lambda', 'μ': '\\mu',
                    'ν': '\\nu', 'ξ': '\\xi', 'π': '\\pi', 'ρ': '\\rho',
                    'σ': '\\sigma', 'τ': '\\tau', 'υ': '\\upsilon', 'φ': '\\phi',
                    'χ': '\\chi', 'ψ': '\\psi', 'ω': '\\omega',
                    'Γ': '\\Gamma', 'Δ': '\\Delta', 'Θ': '\\Theta', 'Λ': '\\Lambda',
                    'Ξ': '\\Xi', 'Π': '\\Pi', 'Σ': '\\Sigma', 'Φ': '\\Phi',
                    'Ψ': '\\Psi', 'Ω': '\\Omega', '∞': '\\infty', '∂': '\\partial'
                };

                for (const [greek, latex] of Object.entries(greekMap)) {
                    text = text.replace(new RegExp(greek, 'g'), latex + ' ');
                }

                return text;
            }
            return this.processChildren(node);
        },

        processFraction: function (node) {
            const num = node.querySelector('num');
            const den = node.querySelector('den');
            const numerator = num ? this.processChildren(num) : '';
            const denominator = den ? this.processChildren(den) : '';
            return `\\frac{${numerator}}{${denominator}}`;
        },

        processRadical: function (node) {
            const deg = node.querySelector('deg');
            const e = node.querySelector('e');
            const degree = deg ? this.processChildren(deg).trim() : '';
            const content = e ? this.processChildren(e) : '';

            if (degree && degree !== '2' && degree !== '') {
                return `\\sqrt[${degree}]{${content}}`;
            }
            return `\\sqrt{${content}}`;
        },

        processSuperscript: function (node) {
            const e = node.querySelector('e');
            const sup = node.querySelector('sup');
            const base = e ? this.processChildren(e) : '';
            const superscript = sup ? this.processChildren(sup) : '';
            return `${base}^{${superscript}}`;
        },

        processSubscript: function (node) {
            const e = node.querySelector('e');
            const sub = node.querySelector('sub');
            const base = e ? this.processChildren(e) : '';
            const subscript = sub ? this.processChildren(sub) : '';
            return `${base}_{${subscript}}`;
        },

        processSubSuperscript: function (node) {
            const e = node.querySelector('e');
            const sub = node.querySelector('sub');
            const sup = node.querySelector('sup');
            const base = e ? this.processChildren(e) : '';
            const subscript = sub ? this.processChildren(sub) : '';
            const superscript = sup ? this.processChildren(sup) : '';
            return `${base}_{${subscript}}^{${superscript}}`;
        },

        processNary: function (node) {
            const naryPr = node.querySelector('naryPr');
            const sub = node.querySelector('sub');
            const sup = node.querySelector('sup');
            const e = node.querySelector('e');

            let operator = '\\int';
            if (naryPr) {
                const chr = naryPr.querySelector('chr');
                if (chr) {
                    const val = chr.getAttribute('m:val') || chr.getAttribute('val');
                    const opMap = {
                        '∫': '\\int', '∬': '\\iint', '∭': '\\iiint',
                        '∑': '\\sum', '∏': '\\prod', '∐': '\\coprod',
                        '⋃': '\\bigcup', '⋂': '\\bigcap', '⋁': '\\bigvee',
                        '⋀': '\\bigwedge'
                    };
                    operator = opMap[val] || '\\int';
                }
            }

            const subscript = sub ? this.processChildren(sub) : '';
            const superscript = sup ? this.processChildren(sup) : '';
            const content = e ? this.processChildren(e) : '';

            let result = operator;
            if (subscript) result += `_{${subscript}}`;
            if (superscript) result += `^{${superscript}}`;
            result += ` ${content}`;

            return result;
        },

        processDelimiter: function (node) {
            const dPr = node.querySelector('dPr');
            let begChr = '(', endChr = ')';

            if (dPr) {
                const beg = dPr.querySelector('begChr');
                const end = dPr.querySelector('endChr');
                if (beg) begChr = beg.getAttribute('m:val') || beg.getAttribute('val') || '(';
                if (end) endChr = end.getAttribute('m:val') || end.getAttribute('val') || ')';
            }

            const e = node.querySelector('e');
            const content = e ? this.processChildren(e) : this.processChildren(node);

            // Map to LaTeX delimiters
            const delimMap = {
                '(': '\\left(', ')': '\\right)',
                '[': '\\left[', ']': '\\right]',
                '{': '\\left\\{', '}': '\\right\\}',
                '|': '\\left|', '‖': '\\left\\|',
                '⌈': '\\left\\lceil', '⌉': '\\right\\rceil',
                '⌊': '\\left\\lfloor', '⌋': '\\right\\rfloor',
                '〈': '\\left\\langle', '〉': '\\right\\rangle'
            };

            const leftDelim = delimMap[begChr] || `\\left${begChr}`;
            const rightDelim = delimMap[endChr] || `\\right${endChr}`;

            return `${leftDelim}${content}${rightDelim}`;
        },

        processMatrix: function (node) {
            const rows = node.querySelectorAll('mr');
            let result = '\\begin{matrix}';

            rows.forEach((row, rowIndex) => {
                if (rowIndex > 0) result += ' \\\\ ';
                const cols = row.querySelectorAll('e');
                cols.forEach((col, colIndex) => {
                    if (colIndex > 0) result += ' & ';
                    result += this.processChildren(col);
                });
            });

            result += '\\end{matrix}';
            return result;
        },

        processFunction: function (node) {
            const fName = node.querySelector('fName');
            const e = node.querySelector('e');
            const funcName = fName ? this.processChildren(fName) : '';
            const content = e ? this.processChildren(e) : '';
            return `${funcName}${content}`;
        },

        processAccent: function (node) {
            const accPr = node.querySelector('accPr');
            const e = node.querySelector('e');
            let accent = '^';

            if (accPr) {
                const chr = accPr.querySelector('chr');
                if (chr) {
                    const val = chr.getAttribute('m:val') || chr.getAttribute('val');
                    const accentMap = {
                        '̂': '\\hat', '̃': '\\tilde', '̄': '\\bar',
                        '⃗': '\\vec', '̇': '\\dot', '̈': '\\ddot',
                        '`': '\\grave', '´': '\\acute', '̆': '\\breve'
                    };
                    accent = accentMap[val] || '\\hat';
                }
            }

            const content = e ? this.processChildren(e) : '';
            return `${accent}{${content}}`;
        },

        processBar: function (node) {
            const e = node.querySelector('e');
            const content = e ? this.processChildren(e) : '';
            return `\\overline{${content}}`;
        },

        processEqArray: function (node) {
            const eqArr = node.querySelectorAll('e');
            let result = '\\begin{aligned}';

            eqArr.forEach((eq, index) => {
                if (index > 0) result += ' \\\\ ';
                result += this.processChildren(eq);
            });

            result += '\\end{aligned}';
            return result;
        },

        processLimLow: function (node) {
            const e = node.querySelector('e');
            const lim = node.querySelector('lim');
            const content = e ? this.processChildren(e) : '';
            const limit = lim ? this.processChildren(lim) : '';
            return `${content}_{${limit}}`;
        },

        processLimUpp: function (node) {
            const e = node.querySelector('e');
            const lim = node.querySelector('lim');
            const content = e ? this.processChildren(e) : '';
            const limit = lim ? this.processChildren(lim) : '';
            return `${content}^{${limit}}`;
        },

        escapeLatex: function (text) {
            // Don't escape if it's already LaTeX commands
            if (text.includes('\\')) return text;

            // Escape special LaTeX characters
            return text
                .replace(/([#$%&_{}])/g, '\\$1')
                .replace(/~/g, '\\textasciitilde{}')
                .replace(/\^/g, '\\textasciicircum{}');
        }
    };

    // === DOCX PARSER ===
    const DocxParser = {
        /**
         * Parse a .docx file and extract content with math, images, and formatting
         * @param {ArrayBuffer} arrayBuffer - The docx file as ArrayBuffer
         * @param {Function} progressCallback - Optional progress callback
         * @returns {Promise<Object>} Parsed content
         */
        parse: async function (arrayBuffer, progressCallback = () => { }) {
            const zip = await JSZip.loadAsync(arrayBuffer);
            progressCallback('Đang đọc file DOCX...', 10);

            // Get document.xml
            const documentXml = await zip.file('word/document.xml')?.async('string');
            if (!documentXml) {
                throw new Error('Không tìm thấy nội dung document.xml trong file DOCX');
            }

            // Parse XML
            const parser = new DOMParser();
            const doc = parser.parseFromString(documentXml, 'application/xml');

            progressCallback('Đang phân tích cấu trúc...', 30);

            // Extract relationships for images
            const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string');
            const relationships = this.parseRelationships(relsXml);

            // Extract images
            progressCallback('Đang xử lý hình ảnh...', 50);
            const images = await this.extractImages(zip, relationships);

            // Process paragraphs
            progressCallback('Đang chuyển đổi nội dung...', 70);
            const content = this.processDocument(doc, images);

            progressCallback('Hoàn thành!', 100);

            return {
                content: content,
                images: images,
                raw: documentXml
            };
        },

        parseRelationships: function (relsXml) {
            if (!relsXml) return {};

            const parser = new DOMParser();
            const doc = parser.parseFromString(relsXml, 'application/xml');
            const rels = {};

            doc.querySelectorAll('Relationship').forEach(rel => {
                const id = rel.getAttribute('Id');
                const target = rel.getAttribute('Target');
                const type = rel.getAttribute('Type');
                rels[id] = { target, type };
            });

            return rels;
        },

        extractImages: async function (zip, relationships) {
            const images = {};

            for (const [id, rel] of Object.entries(relationships)) {
                if (rel.type?.includes('image')) {
                    const imagePath = 'word/' + rel.target.replace('../', '');
                    const imageFile = zip.file(imagePath);

                    if (imageFile) {
                        const blob = await imageFile.async('blob');
                        const base64 = await this.blobToBase64(blob);
                        images[id] = {
                            path: imagePath,
                            base64: base64,
                            blob: blob
                        };
                    }
                }
            }

            return images;
        },

        blobToBase64: function (blob) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        },

        processDocument: function (doc, images) {
            const body = doc.querySelector('body');
            if (!body) return '';

            let result = '';
            const paragraphs = body.querySelectorAll('p');

            paragraphs.forEach(p => {
                const paragraphContent = this.processParagraph(p, images);
                if (paragraphContent.trim()) {
                    result += paragraphContent + '\n';
                }
            });

            // Process tables
            const tables = body.querySelectorAll('tbl');
            tables.forEach(tbl => {
                result += this.processTable(tbl, images) + '\n';
            });

            return result.trim();
        },

        processParagraph: function (p, images) {
            let result = '';

            p.childNodes.forEach(child => {
                const tagName = child.localName || child.nodeName.replace(/^[^:]+:/, '');

                switch (tagName) {
                    case 'r': // Run
                        result += this.processRun(child, images);
                        break;
                    case 'oMath':
                    case 'oMathPara':
                        const latex = OmmlToLatex.convert(child);
                        if (latex.trim()) {
                            result += ` $${latex.trim()}$ `;
                        }
                        break;
                    case 'hyperlink':
                        result += this.processHyperlink(child, images);
                        break;
                }
            });

            return result;
        },

        processRun: function (run, images) {
            let result = '';

            run.childNodes.forEach(child => {
                const tagName = child.localName || child.nodeName.replace(/^[^:]+:/, '');

                switch (tagName) {
                    case 't': // Text
                        result += child.textContent || '';
                        break;
                    case 'drawing': // Image
                        result += this.processDrawing(child, images);
                        break;
                    case 'pict': // Embedded picture (VML)
                        result += this.processPict(child, images);
                        break;
                    case 'br': // Line break
                        result += '\n';
                        break;
                    case 'tab':
                        result += '\t';
                        break;
                }
            });

            return result;
        },

        processDrawing: function (drawing, images) {
            // Find the image reference
            const blip = drawing.querySelector('blip');
            if (blip) {
                const embedId = blip.getAttribute('r:embed') || blip.getAttribute('embed');
                if (embedId && images[embedId]) {
                    return `\n[center]${images[embedId].base64}[/center]\n`;
                }
            }
            return '';
        },

        processPict: function (pict, images) {
            const imageData = pict.querySelector('imagedata');
            if (imageData) {
                const relId = imageData.getAttribute('r:id') || imageData.getAttribute('id');
                if (relId && images[relId]) {
                    return `\n[center]${images[relId].base64}[/center]\n`;
                }
            }
            return '';
        },

        processHyperlink: function (hyperlink, images) {
            let result = '';
            hyperlink.querySelectorAll('r').forEach(r => {
                result += this.processRun(r, images);
            });
            return result;
        },

        processTable: function (tbl, images) {
            let result = '\n| ';
            const rows = tbl.querySelectorAll('tr');

            rows.forEach((row, rowIndex) => {
                const cells = row.querySelectorAll('tc');
                cells.forEach((cell, cellIndex) => {
                    const cellContent = this.processTableCell(cell, images);
                    result += cellContent.trim() + ' | ';
                });

                // Add header separator after first row
                if (rowIndex === 0) {
                    result += '\n| ';
                    cells.forEach(() => {
                        result += '--- | ';
                    });
                }

                if (rowIndex < rows.length - 1) {
                    result += '\n| ';
                }
            });

            result += '\n';
            return result;
        },

        processTableCell: function (cell, images) {
            let result = '';
            cell.querySelectorAll('p').forEach(p => {
                result += this.processParagraph(p, images) + ' ';
            });
            return result;
        }
    };

    // === QUESTION DETECTOR ===
    const QuestionDetector = {
        /**
         * Split content into individual questions
         * @param {string} content - The full document content
         * @returns {Array<string>} Array of question blocks
         */
        splitIntoQuestions: function (content) {
            // Pattern for Vietnamese question format
            const questionPattern = /(?=Câu\s*\d+[\s:.]+)/gi;
            const questions = content.split(questionPattern)
                .map(q => q.trim())
                .filter(q => q.length > 0);

            // If no questions found, try alternative patterns
            if (questions.length <= 1) {
                const altPattern = /(?=\d+\.\s+)/g;
                const altQuestions = content.split(altPattern)
                    .map(q => q.trim())
                    .filter(q => q.length > 0);

                if (altQuestions.length > 1) {
                    return altQuestions;
                }
            }

            return questions.length > 0 ? questions : [content];
        },

        /**
         * Auto-detect question type
         * @param {string} questionText - The question text
         * @returns {string} Question type: 'MC', 'TABLE_TF', or 'NUMERIC'
         */
        detectType: function (questionText) {
            // Check for multiple choice (A. B. C. D.)
            if (/[A-D]\.\s*.+/m.test(questionText)) {
                return 'MC';
            }

            // Check for true/false table (a) b) c) d))
            if (/[a-d]\)\s*.+/m.test(questionText)) {
                return 'TABLE_TF';
            }

            // Default to numeric/short answer
            return 'NUMERIC';
        }
    };

    // === IMAGE UPLOADER ===
    const ImageUploader = {
        /**
         * Upload image to Cloudinary
         * @param {string} base64Data - Image data as base64
         * @returns {Promise<string>} Uploaded image URL
         */
        upload: async function (base64Data) {
            const url = `https://api.cloudinary.com/v1_1/${CONFIG.cloudinary.cloudName}/image/upload`;

            const formData = new FormData();
            formData.append('file', base64Data);
            formData.append('upload_preset', CONFIG.cloudinary.uploadPreset);

            const response = await fetch(url, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || 'Upload failed');
            }

            const data = await response.json();

            // Apply transforms
            const transformedUrl = data.secure_url.replace(
                '/upload/',
                `/upload/${CONFIG.cloudinary.transforms}/`
            );

            return transformedUrl;
        },

        /**
         * Process and upload all images in content
         * @param {string} content - Content with base64 images
         * @param {Function} progressCallback - Progress callback
         * @returns {Promise<string>} Content with uploaded image URLs
         */
        processContent: async function (content, progressCallback = () => { }) {
            // Find all base64 images
            const base64Regex = /\[center\](data:image\/[^;]+;base64,[^[]+)\[\/center\]/g;
            const matches = [...content.matchAll(base64Regex)];

            if (matches.length === 0) {
                return content;
            }

            let processedContent = content;
            let uploaded = 0;

            for (const match of matches) {
                const base64Data = match[1];
                progressCallback(`Đang tải lên ảnh ${uploaded + 1}/${matches.length}...`);

                try {
                    const url = await this.upload(base64Data);
                    processedContent = processedContent.replace(match[0], `[center]${url}[/center]`);
                    uploaded++;
                } catch (error) {
                    console.error('Image upload error:', error);
                    // Keep the base64 as fallback
                }
            }

            progressCallback(`Đã tải lên ${uploaded}/${matches.length} ảnh`);
            return processedContent;
        }
    };

    // === PUBLIC API ===
    return {
        /**
         * Parse a Word document and return structured content
         * @param {File|ArrayBuffer} input - The .docx file
         * @param {Object} options - Parser options
         * @returns {Promise<Object>} Parsed result
         */
        parse: async function (input, options = {}) {
            const { onProgress = () => { }, uploadImages = true } = options;

            let arrayBuffer;
            if (input instanceof File) {
                arrayBuffer = await input.arrayBuffer();
            } else {
                arrayBuffer = input;
            }

            // Parse document
            const parsed = await DocxParser.parse(arrayBuffer, onProgress);

            // Upload images if enabled
            let content = parsed.content;
            if (uploadImages) {
                content = await ImageUploader.processContent(content, onProgress);
            }

            // Split into questions
            const questions = QuestionDetector.splitIntoQuestions(content);

            return {
                content: content,
                questions: questions,
                questionCount: questions.length,
                hasImages: Object.keys(parsed.images).length > 0,
                imageCount: Object.keys(parsed.images).length
            };
        },

        /**
         * Convert OMML XML string to LaTeX
         * @param {string} ommlString - OMML XML string
         * @returns {string} LaTeX string
         */
        ommlToLatex: function (ommlString) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(ommlString, 'application/xml');
            return OmmlToLatex.convert(doc.documentElement);
        },

        /**
         * Split content into questions
         * @param {string} content - Full content
         * @returns {Array<string>} Questions array
         */
        splitQuestions: function (content) {
            return QuestionDetector.splitIntoQuestions(content);
        },

        /**
         * Detect question type
         * @param {string} questionText - Question text
         * @returns {string} Question type
         */
        detectQuestionType: function (questionText) {
            return QuestionDetector.detectType(questionText);
        },

        /**
         * Upload single image
         * @param {string} base64Data - Image as base64
         * @returns {Promise<string>} Uploaded URL
         */
        uploadImage: function (base64Data) {
            return ImageUploader.upload(base64Data);
        },

        // Expose utilities
        OmmlToLatex: OmmlToLatex,
        DocxParser: DocxParser,
        QuestionDetector: QuestionDetector,
        ImageUploader: ImageUploader,

        // Configuration
        config: CONFIG
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WordParser;
}
