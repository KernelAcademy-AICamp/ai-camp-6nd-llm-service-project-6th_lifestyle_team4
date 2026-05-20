enum WorkFormat { movie, drama, play, musical }

WorkFormat _parseFormat(String? v) {
  switch (v) {
    case 'movie':
      return WorkFormat.movie;
    case 'drama':
      return WorkFormat.drama;
    case 'play':
      return WorkFormat.play;
    case 'musical':
      return WorkFormat.musical;
    default:
      return WorkFormat.movie;
  }
}

String formatLabelKo(WorkFormat f) {
  switch (f) {
    case WorkFormat.movie:
      return '영화';
    case WorkFormat.drama:
      return '드라마';
    case WorkFormat.play:
      return '연극';
    case WorkFormat.musical:
      return '뮤지컬';
  }
}

class Work {
  final int workId;
  final String title;
  final WorkFormat format;
  final int? releaseYear;
  final String? creator;
  final String? description;

  const Work({
    required this.workId,
    required this.title,
    required this.format,
    this.releaseYear,
    this.creator,
    this.description,
  });

  factory Work.fromMap(Map<String, dynamic> map) => Work(
        workId: (map['work_id'] as num).toInt(),
        title: map['title'] as String,
        format: _parseFormat(map['format'] as String?),
        releaseYear: (map['release_year'] as num?)?.toInt(),
        creator: map['creator'] as String?,
        description: map['description'] as String?,
      );
}
