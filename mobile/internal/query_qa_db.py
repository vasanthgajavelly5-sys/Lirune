import sqlite3
c=sqlite3.connect('mobile/internal/lirune_qa_copy.db')
print(c.execute("select filePath from books where format='mobi'").fetchone()[0])
