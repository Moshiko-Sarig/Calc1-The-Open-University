"""Import the supplied 20109 question crops without re-OCR or PDF placeholders."""
import hashlib
import json
from pathlib import Path
import shutil
import struct
import sys
from urllib.parse import quote

root = Path(__file__).resolve().parent.parent
source = Path(sys.argv[1]).resolve()
target = root / 'linear1-archive'
raw = (source / 'data/questions.json').read_bytes()
# The export mixes UTF-8 and CESU-8 surrogate pairs. Rejoin pairs losslessly.
text = raw.decode('utf-8', 'surrogatepass').encode('utf-16', 'surrogatepass').decode('utf-16')
data = json.loads(text)
assert data['course']['code'] == '20109'
fields = 'id exam_id year semester semester_label exam_label question_number question_label type type_label prompt answer solution tags unit_ids unit_labels source prompt_images solution_images is_maman assignment_number solution_note review_note answer_choice related_exam_questions related_maman_questions'.split()
questions = [{k: q[k] for k in fields if k in q} for q in data['questions']]
manifest = []
image_sizes = {}
for q in questions:
    for field in ('prompt_images', 'solution_images'):
        paths = []
        for name in q.get(field, []):
            original = source / quote(name, safe='/-._%')
            if not original.is_file():
                original = source / name
            blob = original.read_bytes()
            assert blob.startswith(b'\x89PNG\r\n\x1a\n'), original
            # ASCII content-based paths avoid percent-encoded Hebrew filenames.
            digest = hashlib.sha256(blob).hexdigest()
            relative = f'images/{digest}.png'
            dest = target / relative
            dest.parent.mkdir(parents=True, exist_ok=True)
            if not dest.exists(): shutil.copyfile(original, dest)
            paths.append(relative)
            image_sizes[relative] = list(struct.unpack('>II', blob[16:24]))
            manifest.append({'source': name, 'path': relative, 'sha256': digest, 'bytes': len(blob)})
        q[field] = paths
exams = data['exams']
summary = {
    'exams': sum(not e.get('is_maman', False) for e in exams),
    'assignments': sum(bool(e.get('is_maman')) for e in exams),
    'questions': len(questions),
    'withSolutions': sum(bool(q['solution_images']) for q in questions),
    'withoutSolutions': sum(not q['solution_images'] for q in questions),
}
output = {'course': data['course'], 'summary': summary, 'units': data['units'], 'exams': exams, 'questions': questions, 'imageSizes': image_sizes}
target.mkdir(exist_ok=True)
(target / 'questions.json').write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')) + '\n')
pdfs = list(source.glob('*.pdf'))
report = {'sourceDataSha256': hashlib.sha256(raw).hexdigest(), 'summary': summary, 'imageReferences': len(manifest), 'uniqueImages': len({m['path'] for m in manifest}), 'invalidPdfFiles': [p.name for p in pdfs if not p.read_bytes().startswith(b'%PDF-')], 'missingSolutionAssignments': sorted({q['exam_id'] for q in questions if not q['solution_images']}), 'images': manifest}
(target / 'import-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k:v for k,v in report.items() if k not in ('images','invalidPdfFiles')},ensure_ascii=False)); print('Invalid PDF placeholders:',len(report['invalidPdfFiles']))
