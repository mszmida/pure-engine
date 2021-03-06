import test from '../../helpers/test'
import compile from '../../helpers/compile'
import escape from 'escape-html'

test('for', async assert => {
  let template

  template = await compile('<ul><for todo in todos><li html="{todo.description}"></li></for></ul>')
  assert.deepEqual(template({
    todos: [
      { description: 'foo' },
      { description: 'bar' },
      { description: 'baz' },
      { description: 'qux' }
    ]
  }), '<ul><li>foo</li><li>bar</li><li>baz</li><li>qux</li></ul>')

  template = await compile('<ul><for foo in bar><li html="{foo.baz}"></li></for></ul>')
  assert.deepEqual(template({
    bar: [
      { baz: 'foo' },
      { baz: 'bar' },
      { baz: 'baz' },
      { baz: 'qux' }
    ]
  }), '<ul><li>foo</li><li>bar</li><li>baz</li><li>qux</li></ul>')

  template = await compile('<ul><for foo in bar><for baz in foo><li html="{baz.qux}"></li></for></for></ul>')
  assert.deepEqual(template({
    bar: [
      [ { qux: 1 }, { qux: 2 } ],
      [ { qux: 3 }, { qux: 4 } ],
      [ { qux: 5 }, { qux: 6 } ]
    ]
  }), '<ul><li>1</li><li>2</li><li>3</li><li>4</li><li>5</li><li>6</li></ul>')

  template = await compile('<ul><for foo in bar><for baz in foo.qux><li html="{baz}"></li></for></for></ul>')
  assert.deepEqual(template({
    bar: [
      { qux: [1, 2] },
      { qux: [3, 4] },
      { qux: [5, 6] }
    ]
  }), '<ul><li>1</li><li>2</li><li>3</li><li>4</li><li>5</li><li>6</li></ul>')

  template = await compile('<ul><for todo in todos><li html="{todo.text}"></li></for></ul>')
  assert.deepEqual(template({
    todos: [
      { text: 'foo' },
      { text: 'bar' },
      { text: 'baz' }
    ]
  }), '<ul><li>foo</li><li>bar</li><li>baz</li></ul>')

  template = await compile('<ul><for a in b><li html="{a.b}"></li></for></ul>')
  assert.deepEqual(template({
    b: [
      { b: 'foo' },
      { b: 'bar' }
    ]
  }), '<ul><li>foo</li><li>bar</li></ul>')

  template = await compile('<ul><for t in b><li html="{t.b}"></li></for></ul>')
  assert.deepEqual(template({
    b: [
      { b: 'foo' },
      { b: 'bar' }
    ]
  }), '<ul><li>foo</li><li>bar</li></ul>')

  template = await compile('<ul><for o in b><li html="{o.b}"></li></for></ul>')
  assert.deepEqual(template({
    b: [
      { b: 'foo' },
      { b: 'bar' }
    ]
  }), '<ul><li>foo</li><li>bar</li></ul>')

  template = await compile('<ul><for e in b><li html="{e.b}"></li></for></ul>')
  assert.deepEqual(template({
    b: [
      { b: 'foo' },
      { b: 'bar' }
    ]
  }), '<ul><li>foo</li><li>bar</li></ul>')

  template = await compile('<for foo in foos><img src="{foo.src}"></for>')
  assert.deepEqual(template({
    foos: [
      { title: 'foo', src: 'foo.jpg' },
      { title: 'bar', src: 'bar.jpg' }
    ]
  }, escape), '<img src="foo.jpg"><img src="bar.jpg">')

  template = await compile('<for foo in foos><if foo.src><img src="{foo.src}"></if></for>')
  assert.deepEqual(template({
    foos: [
      { title: 'foo', src: 'foo.jpg' },
      { title: 'bar', src: null }
    ]
  }, escape), '<img src="foo.jpg">')

  template = await compile('<for foo in foos><if foo.src><img src="{foo.src}"></if></for>')
  assert.deepEqual(template({
    foos: [
      { title: 'foo', src: 'foo.jpg' },
      { title: 'bar', src: null }
    ]
  }, escape), '<img src="foo.jpg">')

  template = await compile('<for foo in foos><if foo.src><img src="{foo.src}"></if><elseif foo.href><a href="{foo.href}"></a></elseif></for>')
  assert.deepEqual(template({
    foos: [
      { title: 'foo', src: 'foo.jpg', href: null },
      { title: 'bar', src: null, href: null },
      { title: 'baz', src: null, href: 'https://buxlabs.pl' }
    ]
  }, escape), '<img src="foo.jpg"><a href="https://buxlabs.pl"></a>')

  template = await compile('{foo}<for foo in bar><div>{foo.baz}</div></for>')
  assert.deepEqual(template({
    foo: 'bar',
    bar: [
      { baz: 'qux' },
      { baz: 'quux' },
      { baz: 'quuux' }
    ]
  }, escape), 'bar<div>qux</div><div>quux</div><div>quuux</div>')

  template = await compile('<div>{foo}<for foo in bar><div>{foo.baz}</div></for></div>')
  assert.deepEqual(template({
    foo: 'bar',
    bar: [
      { baz: 'qux' },
      { baz: 'quux' },
      { baz: 'quuux' }
    ]
  }, escape), '<div>bar<div>qux</div><div>quux</div><div>quuux</div></div>')

  template = await compile('<div>{foo}</div><for foo in bar><div>{foo.baz}</div></for>')
  assert.deepEqual(template({
    foo: 'bar',
    bar: [
      { baz: 'qux' },
      { baz: 'quux' },
      { baz: 'quuux' }
    ]
  }, escape), '<div>bar</div><div>qux</div><div>quux</div><div>quuux</div>')

  template = await compile('<for foo in bar><div>{foo.baz}</div></for><div>{foo}</div>')
  assert.deepEqual(template({
    foo: 'bar',
    bar: [
      { baz: 'qux' },
      { baz: 'quux' },
      { baz: 'quuux' }
    ]
  }, escape), '<div>qux</div><div>quux</div><div>quuux</div><div>bar</div>')

  template = await compile('<ul><for todo in="{todos}"><li html="{todo.description}"></li></for></ul>')
  assert.deepEqual(template({
    todos: [
      { description: 'foo' },
      { description: 'bar' },
      { description: 'baz' },
      { description: 'qux' }
    ]
  }, escape), '<ul><li>foo</li><li>bar</li><li>baz</li><li>qux</li></ul>')

  template = await compile('<ul><for foo in="{bar}"><for baz in="{foo.qux}"><li html="{baz}"></li></for></for></ul>')
  assert.deepEqual(template({
    bar: [
      { qux: [1, 2] },
      { qux: [3, 4] },
      { qux: [5, 6] }
    ]
  }, escape), '<ul><li>1</li><li>2</li><li>3</li><li>4</li><li>5</li><li>6</li></ul>')

  template = await compile('<for baz in qux>{foo({ bar: baz })}</for>')
  assert.deepEqual(template({
    foo: object => object.bar, qux: ['qux', 'quux']
  }, escape), 'quxquux')

  template = await compile('<for doc in docs><for foo in doc.items>{foo.bar.baz.qux.quux}</for></for>')
  assert.deepEqual(template({
    docs: [
      { items: [{ bar: { baz: { qux: { quux: '1' } } } }] },
      { items: [{ bar: { baz: { qux: { quux: '2' } } } }] },
      { items: [{ bar: { baz: { qux: { quux: '3' } } } }] }
    ]
  }, escape), '123')

  template = await compile('<for doc in docs>{doc.name}<for key and value in doc.items>{key}{value}</for></for>')
  assert.deepEqual(template({
    docs: [
      { name: 'foo', items: { bar: 'baz', qux: 'quux' } }
    ]
  }, escape), 'foobarbazquxquux')

  template = await compile('<for number in range="0...10">{number}</for>')
  assert.deepEqual(template({}, escape), '0123456789')

  template = await compile('<for number in range="0..10">{number}</for>')
  assert.deepEqual(template({}, escape), '012345678910')

  template = await compile('<for number in range="10">{number}</for>')
  assert.deepEqual(template({}, escape), '012345678910')

  template = await compile('<for month in="{["Styczeń", "Luty", "Marzec"]}">{month}</for>')
  assert.deepEqual(template({}, escape), 'StyczeńLutyMarzec')

  template = await compile('<for foo in="{[bar, baz]}">{foo}</for>')
  assert.deepEqual(template({ bar: 'bar', baz: 'baz' }, escape), 'barbaz')

  template = await compile(`<for foo in='{[{ key: 'bar' }, { key: 'baz' }]}'>{foo.key}</for>`)
  assert.deepEqual(template({ bar: 'bar', baz: 'baz' }, escape), 'barbaz')

  template = await compile(`{baz}<for foo in bar><for baz in foo>{baz.quz}</for></for>{baz}`)
  assert.deepEqual(template({
    bar: [ [{ quz: 1 }], [{ quz: 2 }] ],
    baz: 'qux'
  }, escape), 'qux12qux')

  template = await compile(`{baz}<for foo in bar><for baz in foo.quz>{baz}</for></for>{baz}`)
  assert.deepEqual(template({
    bar: [ { quz: [1, 2, 3] }, { quz: [4, 5, 6] } ],
    baz: 'qux'
  }, escape), 'qux123456qux')

  template = await compile(`<for key and value in foo>{key}{value}</for>`)
  assert.deepEqual(template({ foo: { bar: 'baz', ban: 'qux' } }, escape), 'barbazbanqux')

  template = await compile(`<for key and value in="{foo}">{key}{value}</for>`)
  assert.deepEqual(template({ foo: { bar: 'baz', ban: 'qux' } }, escape), 'barbazbanqux')
})
